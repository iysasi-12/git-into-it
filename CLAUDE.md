# Away-Game Travel Planner (BGSU Hackathon 2026)

Web app that helps athletic departments plan away-game travel. It costs three packages (A Lowest Cost, B Balanced, C Comfort) from a local dataset. Aivana (the required hackathon AI) parses requests, recommends an option, interprets what-if chat, and writes a travel memo.

## Non-negotiable rules
- **The AI never produces numbers.** Prices, distances, counts, availability and times come only from `server/data/*.json` plus engine code. AI output is validated (zod) and scrubbed (`server/src/ai/guards.ts`).
- Aivana must stay a core feature (parse, recommend, what-if, memo). Costs shown are always labeled estimates.
- `server/src/engine/` must never import from `server/src/ai/`. AI receives only app-computed fact sheets (`engine/summary.ts`).
- All prompts live in `server/src/ai/prompts.ts`. The frontend never calculates costs (summing server line items for display is OK).

## Commands (run from repo root)
- `npm install`: root only (npm workspaces: `shared`, `server`, `client`)
- `npm run dev`: API on :3001 + Vite on :5173 (proxies `/api`)
- `npm test`: vitest in server (engine + guards). `npm run typecheck`: both workspaces
- Server only: `npm -w server run dev`. Watch tests: `npm -w server exec vitest`

## Architecture
```
client (React+TS+Tailwind v4, Vite) --/api--> server/src/routes/api.ts
   holds {request, modifiers[]}            ├─ engine/  pure calc: calculator, profiles, modifiers, optionBuilder, timeline, summary
   (server is stateless; undo = drop one)  └─ ai/aiService ─> aivanaClient (fetch)
                                                 prompts · schemas (zod→JSON Schema) · guards · heuristics
```
- Endpoints: `GET /api/opponents`, `POST /api/parse`, `/api/plan`, `/api/recommend`, `/api/whatif`, `/api/memo`. `/plan` and `/whatif` return options without waiting on the AI; the client fetches `/recommend` afterwards (live Aivana takes 15–35 s). Bodies are validated in `server/src/validation.ts`; errors use `AppError` + `middleware/errorHandler.ts`.
- **Aivana API:** `POST {AIVANA_BASE_URL}/generate`, header `X-API-Key`, body `{ prompt }` → `{ answer }`. There is no JSON mode, so the schema is embedded in the prompt; `callStructured` extracts the JSON, validates it, and retries once with the error.
- **Mock/fallback:** with no key or `AIVANA_MOCK=true`, `ai/heuristics.ts` answers every task. On an AI error, the same heuristics run and the result is marked `source: "fallback"`.
- Dataset: only `server/src/data/dataRepository.ts` (`loadDataset()`) knows the JSON file format. The rest of the code uses `Dataset` types from `shared/src/types.ts`.

## Conventions
- Shared types: `import type { … } from "@app/shared"` (type-only package).
- Server imports use `.js` extensions (ESM, run with tsx; `build` is just a typecheck).
- Engine tests use values computed by hand against the dataset. Changing the data means re-deriving the expected numbers, never just pasting in whatever the code outputs.
- Small, focused changes. Run `npm run typecheck && npm test` before calling something done.

## Team and ownership (2 people; plan in docs/)
- **Lead (senior, the person usually driving Claude Code):** finishing the sample dataset, live Aivana and prompt tuning, PR reviews, deploy. Guide: `docs/lead-guide.md`.
- **Lead also owns the frontend tasks F3–F5** (mobile, skeletons, copy memo) from `docs/student-1-guide.md`. Student 1 left on 2026-11-21 after F1 and F2 were merged. These are normal tasks now, so implement them directly when asked.
- **Student 2 (Mika, first-year, data/tests):** D1–D5 done. Phase 2 tasks D6–D9: the live-answer capture script and `liveAnswers.test.ts` fixtures, `docs/judge-inputs.md`, hand-checked demo numbers, and the AI wait counter (`useElapsedSeconds`). Guide: `docs/student-2-guide.md`. She doesn't edit `prompts.ts`, `schemas.ts`, `aiService.ts` or `aivanaClient.ts`; those are the lead's while L3 is in progress.
- Student 2's tasks are learning tasks. **Do not implement them unless the lead explicitly asks.** When reviewing their work, explain and point the way; don't rewrite it.

## Current status / gotchas
- **Tested against live Aivana on 2026-11-21:** the full README demo script ran in a browser with every AI call answered by Aivana (12/12, no "Rules fallback"). That needs the timeouts at 30 s / 60 s (the defaults now; a local `.env` with `AIVANA_TIMEOUT_MS=20000` overrides them and causes fallbacks).
- Live Aivana is slow: parse ~8 s, what-if 8–20 s, recommend 34–43 s, memo 26–32 s. So `/plan` and `/whatif` return options instantly and the client loads `/recommend` in the background. Mock mode stays the offline demo backup.
- Live Aivana drops underscores from enum values (`daybefore`); `canonicalEnum` in `guards.ts` repairs them before zod validation. Keep it.
- There is **no official dataset**. `server/data/*.json` is our own sample dataset and is the source of truth: approximate distances, fictional hotels, illustrative rates. When adding data, keep it plausible and never let the AI fill in gaps.
- **Dataset frozen (2026-11-21):** 15 venues (all MAC opponents plus Ohio State, Michigan, Penn State), 3+ hotels each. Only add entries; never change existing values. Check with `npm -w server run validate-data`.
- Venue matching (`matchVenue`) prefers the longest matching alias ("Central Michigan" beats Michigan's "michigan"). Don't add a bare `"ohio"` alias: "Bowling Green, Ohio" would match Ohio University.
- Toledo, Eastern Michigan, Akron and Central Michigan are short drives, so Option A is a same-day trip. UMass is a 10h drive; avoid it in demos.
- Dates without a year roll forward to the next occurrence (in Nov 2026, "October 12" → 2027-10-12).
- With the sample data, a $4,000 hotel cap can't be met; demo with $7,000.
- Option A uses the latest feasible departure (game day if the drive is ≤ 3h), which differs from what the user requested. This is intentional and shown as a warning.
