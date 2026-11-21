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
- Endpoints: `GET /api/opponents`, `POST /api/parse`, `/api/plan`, `/api/whatif`, `/api/memo`. Bodies are validated in `server/src/validation.ts`; errors use `AppError` + `middleware/errorHandler.ts`.
- **Aivana API:** `POST {AIVANA_BASE_URL}/generate`, header `X-API-Key`, body `{ prompt }` → `{ answer }`. There is no JSON mode, so the schema is embedded in the prompt; `callStructured` extracts the JSON, validates it, and retries once with the error.
- **Mock/fallback:** with no key or `AIVANA_MOCK=true`, `ai/heuristics.ts` answers every task. On an AI error, the same heuristics run and the result is marked `source: "fallback"`.
- Dataset: only `server/src/data/dataRepository.ts` (`loadDataset()`) knows the JSON file format. The rest of the code uses `Dataset` types from `shared/src/types.ts`.

## Conventions
- Shared types: `import type { … } from "@app/shared"` (type-only package).
- Server imports use `.js` extensions (ESM, run with tsx; `build` is just a typecheck).
- Engine tests use values computed by hand against the dataset. Changing the data means re-deriving the expected numbers, never just pasting in whatever the code outputs.
- Small, focused changes. Run `npm run typecheck && npm test` before calling something done.

## Team and ownership (3 people; plan in docs/)
- **Lead (senior, the person usually driving Claude Code):** finishing the sample dataset, live Aivana and prompt tuning, PR reviews, deploy. Guide: `docs/lead-guide.md`.
- **Student 1 (first-year, frontend):** `CostChart.tsx`, deltas in `usePlanner.ts`/`OptionCard.tsx`, mobile, skeletons. Guide: `docs/student-1-guide.md`.
- **Student 2 (first-year, data/tests):** `validateData.ts`, `engine.test.ts` edge cases, `heuristics.ts` phrasings. Guide: `docs/student-2-guide.md`.
- These are learning tasks. **Do not implement student tasks unless the lead explicitly asks.** When reviewing their work, explain and point the way; don't rewrite it.

## Current status / gotchas
- MVP complete and working in mock mode. Not yet tested against live Aivana.
- There is **no official dataset**. `server/data/*.json` is our own sample dataset and is the source of truth: approximate distances, fictional hotels, illustrative rates. When adding data, keep it plausible and never let the AI fill in gaps.
- Dates without a year roll forward to the next occurrence (in Nov 2026, "October 12" → 2027-10-12).
- With the sample data, a $4,000 hotel cap can't be met; demo with $7,000.
- Option A uses the latest feasible departure (game day if the drive is ≤ 3h), which differs from what the user requested. This is intentional and shown as a warning.
