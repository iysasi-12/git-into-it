import { mkdirSync, writeFileSync } from "node:fs";
import type { TripRequest, WhatIfCommand } from "@app/shared";
import { env } from "../src/config/env.js";
import { generate } from "../src/ai/aivanaClient.js";
import { prompts } from "../src/ai/prompts.js";
import { getDataset } from "../src/data/dataRepository.js";
import { buildPlan } from "../src/engine/optionBuilder.js";
import { memoFacts, planFacts } from "../src/engine/summary.js";

type Capture = {
  task: "parse" | "recommend" | "whatif" | "memo";
  input: string;
  answer: string; // the RAW first answer, before any repair or retry
  expected: "valid" | "known-bad";
  expectedCommand?: Partial<WhatIfCommand>;
  capturedAt: string;
};
type Case = Pick<Capture, "task" | "input" | "expectedCommand"> & { prompt: string };

const ds = getDataset();
const today = new Date().toISOString().slice(0, 10);

// Keep identical to `base` in liveAnswers.test.ts.
const base: TripRequest = {
  opponentId: "ohio-state",
  gameDate: "2027-10-09",
  players: 65,
  coaches: 8,
  staff: 4,
  departure: "day_before",
  earliestDepartureTime: "14:00",
  specialRequests: [],
};
const plan = buildPlan(base);

// Copy this from aiService.interpretWhatIf so the prompt matches the app exactly.
const context = {
  players: plan.request.players,
  coaches: plan.request.coaches,
  staff: plan.request.staff,
  requestedDeparture: plan.request.departure,
  hotelBudgetCap: plan.hotelBudgetCap,
  options: plan.options.map((o) => ({ id: o.id, buses: o.buses.count, hotelTier: o.hotel?.tier ?? null })),
};

const parseInputs = [
  "We're playing Ohio State on October 10th. 65 players, 8 coaches and 4 staff. Leave Friday after class.",
  "Buffalo game 11/14, 50 players 6 coaches 3 staff, leave two days before.",
  "Going to Kent State Saturday, same day trip, 45 players, 7 coaches, 3 staff. Need vegetarian meals for 4 players.",
  "Penn State, Oct 24, 70 players 9 coaches 5 staff, leave the day before at 2pm.",
  "Michigan next Saturday with the whole roster.",
];

const whatIfs: [string, Partial<WhatIfCommand>][] = [
  ["Leave 3 players home", { action: "adjust_players", amount: -3 }],
  ["Cap hotel budget at $4000", { action: "set_hotel_budget_cap", amount: 4000 }],
  ["Use one fewer bus", { action: "adjust_buses", amount: -1 }],
  ["Upgrade hotel quality", { action: "shift_hotel_tier", amount: 1 }],
  ["Drop 5 guys from the roster", { action: "adjust_players", amount: -5 }],
  ["Lose two assistant coaches", { action: "adjust_coaches", amount: -2 }],
  ["What if we add a trainer", { action: "adjust_staff", amount: 1 }],
  ["We can only spend 6k on hotels", { action: "set_hotel_budget_cap", amount: 6000 }],
  ["Send 4 players home", { action: "adjust_players", amount: -4 }],
  ["Take two fewer staff", { action: "adjust_staff", amount: -2 }],
  ["Switch to a cheaper hotel", { action: "shift_hotel_tier", amount: -1 }],
  ["Let's leave Thursday instead", { action: "set_departure", departure: "two_days_before" }],
  ["Put 3 players per room", { action: "set_player_occupancy", amount: 3 }],
  ["Put three players per room", { action: "set_player_occupancy", amount: 3 }],
  ["Send 2 more coaches", { action: "adjust_coaches", amount: 2 }],
  ["Add one more bus", { action: "adjust_buses", amount: 1 }],
  ["Put only 3 players per room", { action: "set_player_occupancy", amount: 3 }],
];

const cases: Case[] = [
  ...parseInputs.map((input): Case => ({
    task: "parse",
    input,
    prompt: prompts.parseRequest(input, today, ds.venues.map((v) => v.school)),
  })),
  ...whatIfs.map(([input, expectedCommand]): Case => ({
    task: "whatif",
    input,
    expectedCommand,
    prompt: prompts.interpretWhatIf(input, context),
  })),
  { task: "recommend", input: "Ohio State base plan", prompt: prompts.recommend(planFacts(plan)) },
  { task: "recommend", input: "Ohio State base plan (2nd run)", prompt: prompts.recommend(planFacts(plan)) },
  { task: "memo", input: "Ohio State, Option B", prompt: prompts.memo(memoFacts(plan, plan.options[1])) },
];

const out: Capture[] = [];
const save = () => writeFileSync("src/ai/fixtures/live-answers.json", JSON.stringify(out, null, 2));

async function main() {
  if (env.aivanaMock) {
    console.error("AIVANA_MOCK is true. Set AIVANA_MOCK=false and AIVANA_API_KEY in .env first.");
    process.exit(1);
  }
  mkdirSync("src/ai/fixtures", { recursive: true });
  const limit = Number(process.env.LIMIT ?? cases.length);
  for (const c of cases.slice(0, limit)) {
    console.log(`→ ${c.task}: ${c.input}`);
    try {
      const answer = await generate(c.prompt, 60_000); // live calls are slow; allow 60 s
      out.push({ task: c.task, input: c.input, answer, expected: "valid", expectedCommand: c.expectedCommand, capturedAt: new Date().toISOString() });
      save(); // save after every call, so a crash doesn't lose earlier answers
    } catch (e) {
      console.error(`  failed: ${(e as Error).message}`);
    }
  }
  console.log(`Saved ${out.length} answers.`);
}

main();