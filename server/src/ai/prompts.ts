import {
  jsonSchemaText,
  MemoSchema,
  ParsedRequestSchema,
  RecommendationSchema,
  WhatIfCommandSchema,
} from "./schemas.js";

// ALL Aivana prompts live here. Aivana's API takes a single `prompt` string,
// so each prompt = shared rules + task + JSON schema + input.

const RULES = `You are the AI assistant inside an athletic-department away-game travel planner.
HARD RULES (never break these):
1. NEVER invent, estimate, or calculate prices, costs, distances, drive times, room counts, bus counts, meal costs, hotel availability, or any other number.
2. You may only mention numbers that appear verbatim in the INPUT. If a number is not in the INPUT, do not write it.
3. Refer to travel packages only by their option IDs ("A", "B", "C") and labels.
4. All costs are estimates computed by the application; describe them as estimates.
5. Respond with ONLY a single JSON object that matches the JSON SCHEMA. No markdown, no code fences, no commentary.`;

function build(task: string, schema: string, input: unknown): string {
  return `${RULES}

TASK:
${task}

JSON SCHEMA:
${schema}

INPUT:
${JSON.stringify(input, null, 2)}`;
}

export const prompts = {
  parseRequest(text: string, today: string, knownOpponents: string[]) {
    return build(
      `Extract a structured away-game travel request from the user's text.
- "opponent": the opposing school as written, normalized to one of KNOWN_OPPONENTS if it clearly matches; null if absent.
- "gameDate": YYYY-MM-DD. If no year is given, use the next occurrence on or after TODAY. null if absent.
- "players", "coaches", "staff": integers only if explicitly stated; otherwise null. Do not guess.
- "departureConstraint.day": "day_before" if they leave the day before the game (e.g. "leave Friday" for a Saturday game), "two_days_before", "game_day" for same-day travel, else null.
- "departureConstraint.earliestTime": HH:MM 24h only if an explicit clock time is given, else null.
- "departureConstraint.note": any wording about departure timing (e.g. "after classes"), else null.
- "specialRequests": other requests (dietary needs, equipment, accessibility, preferences). Empty array if none.`,
      jsonSchemaText(ParsedRequestSchema),
      { TODAY: today, KNOWN_OPPONENTS: knownOpponents, USER_TEXT: text },
    );
  },

  recommend(facts: unknown) {
    return build(
      `Three travel options (A = Lowest Cost, B = Balanced, C = Comfort) have been fully costed by the application.
Recommend ONE option for an athletic department balancing cost, player rest/recovery, and logistics risk.
- "reasoning": 2-4 sentences. Cite only figures that appear in INPUT (option totals, comparisons.costDifference, comparisons.percentDifference, etc.).
- "tradeoffs": exactly one entry per option (A, B, C) with 1-3 short pros and 1-3 short cons each.
- Take warnings seriously (e.g. over budget, hotel substitutions, policy-forced departures).
- Respect any hotelBudgetCap and specialRequests in INPUT.trip.`,
      jsonSchemaText(RecommendationSchema),
      facts,
    );
  },

  interpretWhatIf(message: string, context: unknown) {
    return build(
      `Convert the user's what-if request into ONE structured modification command for the planner. The application will recalculate everything.
Actions:
- adjust_players / adjust_coaches / adjust_staff: "amount" = signed change (e.g. "leave 3 players home" -> -3).
- adjust_buses: "amount" = signed change in bus count (e.g. "one fewer bus" -> -1).
- set_hotel_budget_cap: "amount" = the dollar cap the USER stated (e.g. "cap hotel at $4000" -> 4000). Never make up a cap.
- set_hotel_tier: "tier" = economy | midscale | upscale when the user names a level.
- shift_hotel_tier: "amount" = +1 to upgrade hotel quality, -1 to downgrade.
- set_departure: "departure" = game_day | day_before | two_days_before.
- unsupported: anything else; explain briefly in "explanation".
"explanation": one short sentence restating the change in plain English.
Use null for fields that do not apply.`,
      jsonSchemaText(WhatIfCommandSchema),
      { USER_MESSAGE: message, CURRENT_PLAN: context },
    );
  },

  memo(facts: unknown) {
    return build(
      `Write a travel memo for the chosen option, for coaches, staff, and the travel coordinator.
- "title": short memo title naming the opponent and game date.
- "summary": 3-5 sentences: who is traveling, how, where they stay, and the estimated total cost (use chosenOption.totalCost exactly; call it an estimate).
- "itinerary": one entry per INPUT.timeline event, in order. "day" = weekday + date, "time" = the timeline time exactly, "activity" = a clear rewrite of the event. Do not add events with new times.
- "departureReminders": 4-6 practical reminders (report time, bag/equipment loading, IDs, weather check, special requests). Only use times from the timeline.
- "mealSchedule": one entry per INPUT.meals item; "note" is a short helpful note (no prices).`,
      jsonSchemaText(MemoSchema),
      facts,
    );
  },

  repair(originalPrompt: string, badAnswer: string, error: string) {
    return `${originalPrompt}

Your previous reply was invalid.
PREVIOUS REPLY:
${badAnswer.slice(0, 2000)}
VALIDATION ERROR:
${error}
Reply again with ONLY a corrected JSON object.`;
  },
};
