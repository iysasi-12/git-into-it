import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Structured-output contracts for every Aivana task. Aivana has no native JSON
// mode, so the JSON Schema is embedded in the prompt and zod validates the reply.

const OptionIdZ = z.enum(["A", "B", "C"]);
const HHMM = z.string().regex(/^\d{2}:\d{2}$/);

export const ParsedRequestSchema = z.object({
  opponent: z.string().nullable(),
  gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  players: z.number().int().nonnegative().nullable(),
  coaches: z.number().int().nonnegative().nullable(),
  staff: z.number().int().nonnegative().nullable(),
  departureConstraint: z.object({
    day: z.enum(["game_day", "day_before", "two_days_before"]).nullable(),
    earliestTime: HHMM.nullable(),
    note: z.string().nullable(),
  }),
  specialRequests: z.array(z.string()),
});
export type ParsedRequest = z.infer<typeof ParsedRequestSchema>;

export const RecommendationSchema = z.object({
  recommendedOptionId: OptionIdZ,
  reasoning: z.string().min(1),
  tradeoffs: z.array(
    z.object({ optionId: OptionIdZ, pros: z.array(z.string()), cons: z.array(z.string()) }),
  ),
});
export type RecommendationOut = z.infer<typeof RecommendationSchema>;

export const WhatIfCommandSchema = z.object({
  action: z.enum([
    "adjust_players",
    "adjust_coaches",
    "adjust_staff",
    "set_hotel_budget_cap",
    "adjust_buses",
    "set_hotel_tier",
    "shift_hotel_tier",
    "set_departure",
    "set_player_occupancy",
    "unsupported",
  ]),
  amount: z.number().nullable().optional(),
  tier: z.enum(["economy", "midscale", "upscale"]).nullable().optional(),
  departure: z.enum(["game_day", "day_before", "two_days_before"]).nullable().optional(),
  explanation: z.string(),
});
export type WhatIfCommandOut = z.infer<typeof WhatIfCommandSchema>;

export const MemoSchema = z.object({
  title: z.string(),
  summary: z.string(),
  itinerary: z.array(z.object({ day: z.string(), time: z.string(), activity: z.string() })),
  departureReminders: z.array(z.string()),
  mealSchedule: z.array(z.object({ day: z.string(), meal: z.string(), note: z.string() })),
});
export type MemoOut = z.infer<typeof MemoSchema>;

export function jsonSchemaText(schema: z.ZodTypeAny): string {
  const { $schema, ...rest } = zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown>;
  void $schema;
  return JSON.stringify(rest);
}
