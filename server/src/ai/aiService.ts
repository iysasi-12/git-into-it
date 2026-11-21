import type { z } from "zod";
import type {
  AiSource,
  ChatTurn,
  DepartureDay,
  ParseResponse,
  PlanResult,
  Recommendation,
  TravelMemo,
  TravelOption,
  TripRequest,
  WhatIfCommand,
} from "@app/shared";
import { env } from "../config/env.js";
import { getDataset, matchVenue } from "../data/dataRepository.js";
import { addDays, nightsFor, weekday } from "../engine/calculator.js";
import { memoFacts, planFacts } from "../engine/summary.js";
import { AivanaError, generate, type AivanaMessage } from "./aivanaClient.js";
import { allowedNumbers, extractJson, numbersInText, scrubDeep } from "./guards.js";
import { heuristicMemo, heuristicParse, heuristicRecommend, heuristicWhatIf } from "./heuristics.js";
import { prompts } from "./prompts.js";
import {
  jsonSchemaObject,
  MemoSchema,
  ParsedRequestSchema,
  RecommendationSchema,
  WhatIfCommandSchema,
  type ParsedRequest,
} from "./schemas.js";

// Orchestrates AI tasks: prompt -> Aivana -> JSON extract -> zod validate (retry once) -> guards.
// Never computes business numbers; it only receives app-computed facts.

interface StructuredOptions {
  timeoutMs?: number;
  /** Send the schema as Aivana's native response_format (only for schemas Aivana accepts). */
  native?: boolean;
}

/** Ask once with the schema as response_format; if Aivana refuses it (400/422), ask again without. */
async function generateStructured(input: string | AivanaMessage[], schema: z.ZodTypeAny, opts: StructuredOptions): Promise<string> {
  if (!opts.native) return generate(input, { timeoutMs: opts.timeoutMs });
  try {
    return await generate(input, { timeoutMs: opts.timeoutMs, jsonSchema: jsonSchemaObject(schema) });
  } catch (err) {
    if (!(err instanceof AivanaError) || (err.status !== 400 && err.status !== 422)) throw err;
    console.warn("[aivana] response_format refused, retrying with the schema in the prompt only:", err.message);
    return generate(input, { timeoutMs: opts.timeoutMs });
  }
}

/** The same input with its last user turn replaced by a repair request. */
function withRepair(input: string | AivanaMessage[], answer: string, error: string): string | AivanaMessage[] {
  if (typeof input === "string") return prompts.repair(input, answer, error);
  const last = input[input.length - 1];
  return [...input.slice(0, -1), { ...last, content: prompts.repair(last.content, answer, error) }];
}

async function callStructured<S extends z.ZodTypeAny>(
  input: string | AivanaMessage[],
  schema: S,
  opts: StructuredOptions = {},
): Promise<z.infer<S>> {
  let answer = await generateStructured(input, schema, opts);
  for (let attempt = 0; ; attempt++) {
    let error: string;
    try {
      const parsed = schema.safeParse(extractJson(answer));
      if (parsed.success) return parsed.data;
      error = JSON.stringify(parsed.error.flatten());
    } catch (e) {
      error = (e as Error).message;
    }
    if (attempt >= 1) throw new Error(`Aivana returned invalid structured output: ${error}`);
    answer = await generateStructured(withRepair(input, answer, error), schema, opts);
  }
}

/** Run the AI path, or the deterministic heuristic in mock mode / on failure. */
async function withFallback<T>(task: string, ai: () => Promise<T>, heuristic: () => T): Promise<{ value: T; source: AiSource }> {
  if (env.aivanaMock) return { value: heuristic(), source: "mock" };
  try {
    return { value: await ai(), source: "ai" };
  } catch (err) {
    console.error(`[aivana:${task}] falling back:`, (err as Error).message);
    return { value: heuristic(), source: "fallback" };
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------

export async function parseRequest(text: string): Promise<ParseResponse> {
  const ds = getDataset();
  const today = todayIso();
  const { value, source } = await withFallback<ParsedRequest>(
    "parse",
    () => callStructured(prompts.parseRequest(text, today, ds.venues.map((v) => v.school)), ParsedRequestSchema),
    () => heuristicParse(text, today, matchVenue(text, ds)?.school ?? null),
  );

  const venue = matchVenue(value.opponent, ds);
  const request: Partial<TripRequest> = {
    ...(venue && { opponentId: venue.id }),
    ...(value.gameDate && { gameDate: value.gameDate }),
    ...(value.players != null && { players: value.players }),
    ...(value.coaches != null && { coaches: value.coaches }),
    ...(value.staff != null && { staff: value.staff }),
    ...(value.departureConstraint.day && { departure: value.departureConstraint.day }),
    ...(value.departureConstraint.earliestTime && { earliestDepartureTime: value.departureConstraint.earliestTime }),
    specialRequests: [
      ...value.specialRequests,
      ...(value.departureConstraint.note ? [`Departure: ${value.departureConstraint.note}`] : []),
    ],
  };
  const required: (keyof TripRequest)[] = ["opponentId", "gameDate", "players", "coaches", "staff", "departure"];
  return {
    request,
    missingFields: required.filter((k) => request[k] == null),
    ...(value.opponent && !venue && { unmatchedOpponent: value.opponent }),
    source,
  };
}

export async function recommend(plan: PlanResult): Promise<Recommendation> {
  const facts = planFacts(plan);
  const { value, source } = await withFallback(
    "recommend",
    () => callStructured(prompts.recommend(facts), RecommendationSchema, { timeoutMs: env.aivanaSlowTimeoutMs, native: true }),
    () => heuristicRecommend(plan),
  );
  const guardNotes: string[] = [];
  const clean = scrubDeep(value, allowedNumbers(facts), guardNotes);
  // Keep one tradeoff entry per real option id.
  const seen = new Set<string>();
  const tradeoffs = clean.tradeoffs.filter((t) => !seen.has(t.optionId) && seen.add(t.optionId));
  return { ...clean, tradeoffs, source, guardNotes };
}

/** Earlier what-if turns sent to Aivana (kept short to limit tokens). */
const WHATIF_HISTORY_TURNS = 6;

export async function interpretWhatIf(
  message: string,
  plan: PlanResult,
  history: ChatTurn[] = [],
): Promise<{ command: WhatIfCommand; source: AiSource }> {
  const departureDays: DepartureDay[] = ["game_day", "day_before", "two_days_before"];
  const context = {
    gameDate: plan.request.gameDate,
    gameWeekday: weekday(plan.request.gameDate),
    // App-computed so the AI only matches a weekday ("Thursday") to a choice, never counts days.
    departureWeekdays: Object.fromEntries(
      departureDays.map((d) => [d, weekday(addDays(plan.request.gameDate, -nightsFor(d)))]),
    ),
    players: plan.request.players,
    coaches: plan.request.coaches,
    staff: plan.request.staff,
    requestedDeparture: plan.request.departure,
    hotelBudgetCap: plan.hotelBudgetCap,
    options: plan.options.map((o) => ({ id: o.id, buses: o.buses.count, hotelTier: o.hotel?.tier ?? null })),
  };
  const { value, source } = await withFallback(
    "whatif",
    () => {
      // Multi-turn: earlier turns go first so Aivana can resolve references ("do the same for coaches").
      const prompt = prompts.interpretWhatIf(message, context);
      const turns = history.slice(-WHATIF_HISTORY_TURNS);
      const input: string | AivanaMessage[] = turns.length
        ? [...turns.map((t): AivanaMessage => ({ role: t.role, content: t.text })), { role: "user", content: prompt }]
        : prompt;
      return callStructured(input, WhatIfCommandSchema);
    },
    () => heuristicWhatIf(message),
  );
  const command: WhatIfCommand = {
    action: value.action,
    explanation: value.explanation,
    ...(value.amount != null && { amount: value.amount }),
    ...(value.tier && { tier: value.tier }),
    ...(value.departure && { departure: value.departure }),
  };

  // Numbers the USER typed, in this message or an earlier user turn (never an assistant turn).
  const userText = [...history.slice(-WHATIF_HISTORY_TURNS).filter((t) => t.role === "user").map((t) => t.text), message].join("\n");

  // Guard: a budget cap must be a number the USER typed, never one the AI made up.
  if (command.action === "set_hotel_budget_cap") {
    const typed = numbersInText(userText).flatMap((n) => [n, n * 1000]);
    if (command.amount == null || !typed.some((n) => Math.abs(n - command.amount!) < 0.01)) {
      return {
        command: { action: "unsupported", explanation: "Please state the hotel budget cap as a dollar amount (e.g. \"cap hotel at $7000\")." },
        source,
      };
    }
  }

  // Guard: player occupancy must match a number the USER typed.
  if (command.action === "set_player_occupancy") {
    const typed = numbersInText(userText);

    if (
      command.amount == null ||
      !typed.some((n) => n === command.amount)
    ) {
      return {
        command: {
          action: "unsupported",
          explanation: "Please state the number of players per room explicitly.",
        },
        source,
      };
    }
  }

  return { command, source };
}

export async function writeMemo(plan: PlanResult, option: TravelOption): Promise<TravelMemo> {
  const facts = memoFacts(plan, option);
  const { value, source } = await withFallback(
    "memo",
    () => callStructured(prompts.memo(facts), MemoSchema, { timeoutMs: env.aivanaSlowTimeoutMs, native: true }),
    () => heuristicMemo(facts),
  );
  const guardNotes: string[] = [];
  const clean = scrubDeep(value, allowedNumbers(facts), guardNotes);
  // Days and times always come from the engine's timeline, whatever format the AI used.
  // The AI only contributes the activity wording (when it returned one entry per event).
  const itinerary = facts.timeline.map((e, i) => ({
    day: e.day,
    time: e.displayTime,
    activity: clean.itinerary.length === facts.timeline.length ? clean.itinerary[i].activity : e.event,
  }));
  const mealSchedule =
    clean.mealSchedule.length === facts.meals.length
      ? clean.mealSchedule.map((m, i) => ({ ...m, day: facts.meals[i].day }))
      : clean.mealSchedule;
  return { ...clean, itinerary, mealSchedule, source, guardNotes };
}