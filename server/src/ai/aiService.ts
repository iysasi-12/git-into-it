import type { z } from "zod";
import type {
  AiSource,
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
import { memoFacts, planFacts } from "../engine/summary.js";
import { generate } from "./aivanaClient.js";
import { allowedNumbers, extractJson, numbersInText, scrubDeep } from "./guards.js";
import { heuristicMemo, heuristicParse, heuristicRecommend, heuristicWhatIf } from "./heuristics.js";
import { prompts } from "./prompts.js";
import {
  MemoSchema,
  ParsedRequestSchema,
  RecommendationSchema,
  WhatIfCommandSchema,
  type ParsedRequest,
} from "./schemas.js";

// Orchestrates AI tasks: prompt -> Aivana -> JSON extract -> zod validate (retry once) -> guards.
// Never computes business numbers; it only receives app-computed facts.

async function callStructured<S extends z.ZodTypeAny>(prompt: string, schema: S, timeoutMs?: number): Promise<z.infer<S>> {
  let answer = await generate(prompt, timeoutMs);
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
    answer = await generate(prompts.repair(prompt, answer, error), timeoutMs);
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
    () => callStructured(prompts.recommend(facts), RecommendationSchema, env.aivanaSlowTimeoutMs),
    () => heuristicRecommend(plan),
  );
  const guardNotes: string[] = [];
  const clean = scrubDeep(value, allowedNumbers(facts), guardNotes);
  // Keep one tradeoff entry per real option id.
  const seen = new Set<string>();
  const tradeoffs = clean.tradeoffs.filter((t) => !seen.has(t.optionId) && seen.add(t.optionId));
  return { ...clean, tradeoffs, source, guardNotes };
}

export async function interpretWhatIf(message: string, plan: PlanResult): Promise<{ command: WhatIfCommand; source: AiSource }> {
  const context = {
    players: plan.request.players,
    coaches: plan.request.coaches,
    staff: plan.request.staff,
    requestedDeparture: plan.request.departure,
    hotelBudgetCap: plan.hotelBudgetCap,
    options: plan.options.map((o) => ({ id: o.id, buses: o.buses.count, hotelTier: o.hotel?.tier ?? null })),
  };
  const { value, source } = await withFallback(
    "whatif",
    () => callStructured(prompts.interpretWhatIf(message, context), WhatIfCommandSchema),
    () => heuristicWhatIf(message),
  );
  const command: WhatIfCommand = {
    action: value.action,
    explanation: value.explanation,
    ...(value.amount != null && { amount: value.amount }),
    ...(value.tier && { tier: value.tier }),
    ...(value.departure && { departure: value.departure }),
  };

  // Guard: a budget cap must be a number the USER typed, never one the AI made up.
  if (command.action === "set_hotel_budget_cap") {
    const typed = numbersInText(message).flatMap((n) => [n, n * 1000]);
    if (command.amount == null || !typed.some((n) => Math.abs(n - command.amount!) < 0.01)) {
      return {
        command: { action: "unsupported", explanation: "Please state the hotel budget cap as a dollar amount (e.g. \"cap hotel at $7000\")." },
        source,
      };
    }
  }

  // Guard: player occupancy must match a number the USER typed.
  if (command.action === "set_player_occupancy") {
    const typed = numbersInText(message);

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
    () => callStructured(prompts.memo(facts), MemoSchema, env.aivanaSlowTimeoutMs),
    () => heuristicMemo(facts),
  );
  const guardNotes: string[] = [];
  const clean = scrubDeep(value, allowedNumbers(facts), guardNotes);
  return { ...clean, source, guardNotes };
}