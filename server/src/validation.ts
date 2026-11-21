import { z } from "zod";
import { AppError } from "./errors.js";
import { WhatIfCommandSchema } from "./ai/schemas.js";

const HHMM = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");

export const TripRequestSchema = z.object({
  opponentId: z.string().min(1),
  gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  gameTime: HHMM.optional(),
  players: z.number().int().min(1).max(200),
  coaches: z.number().int().min(0).max(50),
  staff: z.number().int().min(0).max(50),
  departure: z.enum(["game_day", "day_before", "two_days_before"]),
  earliestDepartureTime: HHMM.optional(),
  specialRequests: z.array(z.string()).default([]),
});

const ModifiersSchema = z
  .array(WhatIfCommandSchema)
  .default([])
  .transform((mods) =>
    mods.map((m) => ({
      action: m.action,
      explanation: m.explanation,
      ...(m.amount != null && { amount: m.amount }),
      ...(m.tier && { tier: m.tier }),
      ...(m.departure && { departure: m.departure }),
    })),
  );

export const ParseBody = z.object({ text: z.string().min(5).max(2000) });
export const PlanBody = z.object({ request: TripRequestSchema, modifiers: ModifiersSchema });
export const WhatIfBody = z.object({ request: TripRequestSchema, modifiers: ModifiersSchema, message: z.string().min(2).max(500) });
export const MemoBody = z.object({ request: TripRequestSchema, modifiers: ModifiersSchema, optionId: z.enum(["A", "B", "C"]) });

export function validate<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new AppError(400, "VALIDATION_ERROR", "Invalid request body.", r.error.flatten());
  return r.data;
}
