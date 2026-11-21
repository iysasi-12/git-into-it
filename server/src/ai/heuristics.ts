import type { DepartureDay, PlanResult, TravelOption, WhatIfCommand } from "@app/shared";
import { weekday } from "../engine/calculator.js";
import type { memoFacts } from "../engine/summary.js";
import type { MemoOut, ParsedRequest, RecommendationOut } from "./schemas.js";

// Deterministic stand-ins for each AI task. Used when AIVANA_MOCK=true and as
// a fallback when Aivana is unreachable or returns invalid output, so the demo never dead-ends.

const WORD_NUMS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const num = (s: string) => WORD_NUMS[s.toLowerCase()] ?? Number(s);
const NUM_WORD = "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)";
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function countFor(text: string, noun: string): number | null {
  const m = text.match(new RegExp(`(\\d+)\\s+${noun}`, "i"));
  return m ? Number(m[1]) : null;
}

function parseDate(text: string, today: string): string | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const t = text.toLowerCase();
  const md = t.match(new RegExp(`\\b(${MONTHS.join("|")}|${MONTHS.map((m) => m.slice(0, 3)).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?`));
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  let month: number, day: number, year: number | undefined;
  if (md) {
    month = MONTHS.findIndex((m) => m.startsWith(md[1].slice(0, 3))) + 1;
    day = Number(md[2]);
    year = md[3] ? Number(md[3]) : undefined;
  } else if (slash) {
    month = Number(slash[1]);
    day = Number(slash[2]);
    year = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : undefined;
  } else return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (!year) {
    year = Number(today.slice(0, 4));
    if (`${year}-${pad(month)}-${pad(day)}` < today) year += 1;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function heuristicParse(text: string, today: string, opponentName: string | null): ParsedRequest {
  const t = text.toLowerCase();
  let day: DepartureDay | null = null;
  if (/two days before|thursday/.test(t)) day = "two_days_before";
  else if (/day before|night before|friday/.test(t)) day = "day_before";
  else if (/game day|same day|morning of/.test(t)) day = "game_day";

  const clock = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  let earliestTime: string | null = null;
  if (clock) {
    let h = Number(clock[1]) % 12;
    if (clock[3] === "pm") h += 12;
    earliestTime = `${String(h).padStart(2, "0")}:${clock[2] ?? "00"}`;
  }

  const special = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => /\b(need|request|prefer|require|vegetarian|vegan|gluten|allerg|accessib|wheelchair|equipment|trainer)/i.test(s))
    .map((s) => s.trim());

  return {
    opponent: opponentName,
    gameDate: parseDate(text, today),
    players: countFor(text, "players?"),
    coaches: countFor(text, "coach(?:es)?"),
    staff: countFor(text, "staff"),
    departureConstraint: { day, earliestTime, note: /after class/.test(t) ? "after classes" : null },
    specialRequests: special,
  };
}

export function heuristicWhatIf(message: string): WhatIfCommand {
  const t = message.toLowerCase();
  const group = (noun: string) => {
    const minus = t.match(new RegExp(`(?:leave|drop|cut|remove|minus|fewer|less|without)\\s+${NUM_WORD}\\s+(?:more\\s+)?${noun}`));
    if (minus) return -num(minus[1]);
    const minus2 = t.match(new RegExp(`${NUM_WORD}\\s+(?:fewer|less)\\s+${noun}`));
    if (minus2) return -num(minus2[1]);
    const plus = t.match(new RegExp(`(?:add|bring|plus|extra|another)\\s+${NUM_WORD}?\\s*(?:more\\s+|extra\\s+)?${noun}`));
    if (plus) return plus[1] ? num(plus[1]) : 1;
    const plus2 = t.match(new RegExp(`${NUM_WORD}\\s+(?:more|extra)\\s+${noun}`));
    if (plus2) return num(plus2[1]);
    return null;
  };

  const p = group("players?");
  if (p) return { action: "adjust_players", amount: p, explanation: `${p < 0 ? "Remove" : "Add"} ${Math.abs(p)} player(s).` };
  const c = group("coach(?:es)?");
  if (c) return { action: "adjust_coaches", amount: c, explanation: `${c < 0 ? "Remove" : "Add"} ${Math.abs(c)} coach(es).` };
  const s = group("staff(?: members?)?");
  if (s) return { action: "adjust_staff", amount: s, explanation: `${s < 0 ? "Remove" : "Add"} ${Math.abs(s)} staff.` };
  const b = group("bus(?:es)?");
  if (b) return { action: "adjust_buses", amount: b, explanation: `${b < 0 ? "Use" : "Add"} ${Math.abs(b)} ${b < 0 ? "fewer" : "more"} bus(es).` };

  const cap = t.match(/\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/);
  if (/(cap|limit|budget|max|under)/.test(t) && /hotel|lodging|room/.test(t) && cap) {
    const amount = Number(cap[1].replace(/,/g, "")) * (cap[2] ? 1000 : 1);
    return { action: "set_hotel_budget_cap", amount, explanation: `Cap total hotel spend at $${amount.toLocaleString()}.` };
  }
  const tier = t.match(/\b(economy|budget|midscale|mid-range|upscale|luxury)\b/);
  if (tier && /hotel/.test(t) && !/upgrade|downgrade/.test(t)) {
    const map = { economy: "economy", budget: "economy", midscale: "midscale", "mid-range": "midscale", upscale: "upscale", luxury: "upscale" } as const;
    const v = map[tier[1] as keyof typeof map];
    return { action: "set_hotel_tier", tier: v, explanation: `Use a ${v} hotel for every option.` };
  }
  if (/upgrade|nicer|better hotel/.test(t)) return { action: "shift_hotel_tier", amount: 1, explanation: "Upgrade hotel quality one level." };
  if (/downgrade|cheaper hotel/.test(t)) return { action: "shift_hotel_tier", amount: -1, explanation: "Downgrade hotel quality one level." };
  if (/two days before|thursday/.test(t)) return { action: "set_departure", departure: "two_days_before", explanation: "Depart two days before the game." };
  if (/day before|night before|friday/.test(t)) return { action: "set_departure", departure: "day_before", explanation: "Depart the day before the game." };
  if (/game day|same day|morning of/.test(t)) return { action: "set_departure", departure: "game_day", explanation: "Travel on game day." };
  return { action: "unsupported", explanation: "I couldn't map that to a supported change (players, coaches, staff, buses, hotel cap/tier, departure)." };
}

const fmt = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function heuristicRecommend(plan: PlanResult): RecommendationOut {
  const [A, B, C] = plan.options;
  const overBudget = (o: TravelOption) => o.warnings.some((w) => /over budget/.test(w));
  const pick = overBudget(B) && !overBudget(A) ? A : B;
  return {
    recommendedOptionId: pick.id,
    reasoning:
      pick.id === "B"
        ? `Option B (Balanced) is an estimated ${fmt(B.totalCost)}, which is ${fmt(B.totalCost - A.totalCost)} more than Option A but ${fmt(C.totalCost - B.totalCost)} less than Option C. It keeps the requested departure and gives coaches single rooms, a reasonable middle ground on rest and cost.`
        : `Option A (Lowest Cost) is the only option that stays within the hotel budget, at an estimated ${fmt(A.totalCost)}.`,
    tradeoffs: plan.options.map((o) => ({
      optionId: o.id,
      pros: [o.id === "A" ? "Lowest estimated total" : o.id === "B" ? "Requested departure with midscale hotel" : "Most rest and comfort", ...(o.nights === 0 ? ["No hotel nights"] : [])],
      cons: [o.id === "A" ? "Least rest before the game" : o.id === "B" ? "Costs more than Option A" : "Highest estimated total", ...(o.warnings.length ? ["Has planner warnings"] : [])],
    })),
  };
}

export function heuristicMemo(facts: ReturnType<typeof memoFacts>): MemoOut {
  const o = facts.chosenOption;
  const dayLabel = (d: string) => `${weekday(d)} ${d}`;
  return {
    title: `Travel Memo: ${facts.trip.opponent} (${facts.trip.gameDate})`,
    summary: `${o.travelers} travelers will travel to ${facts.trip.city} on ${o.buses.count} ${o.buses.type} bus(es) under Option ${o.id} (${o.label}). ${o.hotel ? `The team stays ${o.nights} night(s) at ${o.hotel.name}.` : "This is a same-day trip with no hotel stay."} Estimated total cost: ${fmt(o.totalCost)}.`,
    itinerary: facts.timeline.map((e) => ({ day: dayLabel(e.date), time: e.time, activity: e.event })),
    departureReminders: [
      `Report to the bus loading area at ${facts.timeline[0]?.time ?? "the scheduled time"} on ${facts.timeline[0] ? dayLabel(facts.timeline[0].date) : "departure day"}.`,
      "Equipment and trainer kits loaded before team boarding.",
      "Bring student ID and a printed or digital copy of this itinerary.",
      "Check the weather forecast at the destination the day before departure.",
      ...facts.trip.specialRequests.map((r) => `Special request: ${r}`),
    ],
    mealSchedule: facts.meals.map((m) => ({ day: dayLabel(m.date), meal: m.meal, note: m.label })),
  };
}
