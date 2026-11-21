import { Router } from "express";
import type {
  MemoResponse,
  OpponentSummary,
  ParseResponse,
  PlanResponse,
  RecommendResponse,
  WhatIfCommand,
  WhatIfResponse,
} from "@app/shared";
import { interpretWhatIf, parseRequest, recommend, writeMemo } from "../ai/aiService.js";
import { getDataset } from "../data/dataRepository.js";
import { buildPlan } from "../engine/optionBuilder.js";
import { AppError } from "../errors.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { MemoBody, ParseBody, PlanBody, validate, WhatIfBody } from "../validation.js";

export const api = Router();

api.get("/health", (_req, res) => {
  res.json({ ok: true });
});

api.get("/opponents", (_req, res) => {
  const list: OpponentSummary[] = getDataset().venues.map((v) => ({
    id: v.id,
    school: v.school,
    city: v.city,
    state: v.state,
    distanceMiles: v.distanceMiles,
    driveHours: v.driveHours,
  }));
  res.json(list);
});

// Free text -> structured request (AI). The client pre-fills the form with it.
api.post(
  "/parse",
  asyncHandler(async (req, res) => {
    const { text } = validate(ParseBody, req.body);
    const result: ParseResponse = await parseRequest(text);
    res.json(result);
  }),
);

// Structured request (+ modifiers) -> 3 calculated options. Engine only, so it is instant;
// the client fetches the AI recommendation separately from /recommend.
api.post(
  "/plan",
  asyncHandler(async (req, res) => {
    const { request, modifiers } = validate(PlanBody, req.body);
    const body: PlanResponse = { plan: buildPlan(request, modifiers) };
    res.json(body);
  }),
);

// Same inputs as /plan -> AI recommendation (slow live, 15-35 s, so it is its own call).
api.post(
  "/recommend",
  asyncHandler(async (req, res) => {
    const { request, modifiers } = validate(PlanBody, req.body);
    const body: RecommendResponse = { recommendation: await recommend(buildPlan(request, modifiers)) };
    res.json(body);
  }),
);

// Chat message -> AI command -> app recalculates everything.
api.post(
  "/whatif",
  asyncHandler(async (req, res) => {
    const { request, modifiers, message } = validate(WhatIfBody, req.body);
    const current = buildPlan(request, modifiers);
    const { command, source } = await interpretWhatIf(message, current);

    const nextModifiers: WhatIfCommand[] = command.action === "unsupported" ? modifiers : [...modifiers, command];
    const plan = command.action === "unsupported" ? current : buildPlan(request, nextModifiers);
    const body: WhatIfResponse = {
      command,
      modifiers: nextModifiers,
      plan,
      note: command.action === "unsupported" ? command.explanation : `Applied: ${command.explanation}`,
      source,
    };
    res.json(body);
  }),
);

// Chosen option -> AI-written memo grounded in computed values.
api.post(
  "/memo",
  asyncHandler(async (req, res) => {
    const { request, modifiers, optionId } = validate(MemoBody, req.body);
    const plan = buildPlan(request, modifiers);
    const option = plan.options.find((o) => o.id === optionId);
    if (!option) throw new AppError(404, "OPTION_NOT_FOUND", `Option ${optionId} not found.`);
    const body: MemoResponse = { memo: await writeMemo(plan, option), option, plan };
    res.json(body);
  }),
);
