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
- Endpoints: `GET /api/opponents`, `GET /api/schedule` (sample away games in `server/data/schedule.json`; picking one pre-fills the form), `POST /api/parse`, `/api/plan`, `/api/recommend`, `/api/whatif`, `/api/memo`. `/plan` and `/whatif` return options without waiting on the AI; the client fetches `/recommend` afterwards (live Aivana takes 15–35 s). Bodies are validated in `server/src/validation.ts`; errors use `AppError` + `middleware/errorHandler.ts`.
- **Aivana API:** `POST {AIVANA_BASE_URL}/generate`, header `X-API-Key`, body `{ prompt }` or `{ messages }` → `{ answer, structured? }`. The schema is always embedded in the prompt; `callStructured` extracts the JSON, validates it (zod), and retries once with the error. Recommend and memo also send it as native `response_format` (`native: true`), falling back to prompt-only on 400/422. Parse and what-if schemas use `anyOf`/`pattern`, which `response_format` refuses. What-if is multi-turn: the client sends the last 6 chat turns as `history`, and the server prepends them as `messages`. Streaming (`/generate:stream`) doesn't support `response_format`.
- **Mock/fallback:** with no key or `AIVANA_MOCK=true`, `ai/heuristics.ts` answers every task. On an AI error, the same heuristics run and the result is marked `source: "fallback"`.
- Dataset: only `server/src/data/dataRepository.ts` (`loadDataset()`) knows the JSON file format. The rest of the code uses `Dataset` types from `shared/src/types.ts`.

## Conventions
- Shared types: `import type { … } from "@app/shared"` (type-only package).
- Server imports use `.js` extensions (ESM, run with tsx; `build` is just a typecheck).
- Engine tests use values computed by hand against the dataset. Changing the data means re-deriving the expected numbers, never just pasting in whatever the code outputs.
- Small, focused changes. Run `npm run typecheck && npm test` before calling something done.

## Team and ownership (3 people; plan in docs/)
- **Lead (senior, the person usually driving Claude Code):** finishing the sample dataset, live Aivana and prompt tuning, PR reviews, deploy. Guide: `docs/lead-guide.md`.
- **Student 1 (Oliver, first-year, frontend):** F1 and F2 done (PR #3). Oliver left on 2026-11-21 and rejoined the same day. While he was away the lead did F3 (mobile) and F4 (skeletons). Oliver is finishing F5 (copy memo as text) in PR #19, then does D9: the AI wait counter (`useElapsedSeconds`), specced in `docs/student-2-guide.md`. Guide: `docs/student-1-guide.md`.
- **Student 2 (Mika, first-year, data/tests):** D1–D5 done. Phase 2 tasks D6–D8: the live-answer capture script and `liveAnswers.test.ts` fixtures, `docs/judge-inputs.md`, and hand-checked demo numbers. Guide: `docs/student-2-guide.md`. She doesn't edit `prompts.ts`, `schemas.ts`, `aiService.ts` or `aivanaClient.ts`; those are the lead's while L3 is in progress.
- Student tasks (Oliver's F-tasks and Mika's D-tasks) are learning tasks. **Do not implement them unless the lead explicitly asks.** When reviewing their work, explain and point the way; don't rewrite it.

## Current status / gotchas
- **Hackathon deadline:** submit by 5 PM on 2026-11-21; 3–5 min presentations at 5:30 PM. The brief requires a structured output call (JSON Schema) **plus** at least one more Aivana feature, and a README covering how to run the app, the Aivana features used and its known limits. We meet these with native `response_format` (recommend, memo) and multi-turn `messages` (what-if chat), plus the README's "Aivana features used" and "Known limits" sections. Don't remove either feature, and keep those README sections in sync with the code.
- **Deployed:** https://104-207-138-88.sslip.io runs live Aivana. Every merge to `main` deploys automatically (GitHub Actions → Vultr; see `deploy/README.md`), so check a change before merging.
- **Live demo check (2026-11-21, after PR #31):** the README demo script ran against the deployed API (not clicked in a browser) with all 15 AI calls answered by Aivana (no "Rules fallback", nothing scrubbed). An earlier browser run (12/12) also passed. Keep the 30 s / 60 s timeouts (the defaults); a local `.env` with `AIVANA_TIMEOUT_MS=20000` overrides them and causes fallbacks.
- Live Aivana is slow: parse 7–12 s, what-if 4–13 s, recommend 22–42 s, memo 12–30 s. So `/plan` and `/whatif` don't wait for the recommendation; the client loads `/recommend` in the background. Mock mode stays the offline demo backup.
- **Memo dates and times** are always MM/DD/YYYY and 12-hour with a zone (`1:30 PM ET`). `writeMemo` takes every itinerary/meal day and time from the engine timeline (`engine/displayFormat.ts`); Aivana only writes the activity text. The prompt asks it to use the same formats in the title and reminders.
- **Multi-turn what-if:** the client sends up to 6 earlier turns as `history`. Budget-cap and occupancy guards accept numbers from earlier *user* turns only, never assistant turns.
- A what-if that changes nothing says why: engine warnings, or `noChangeReason()` in `engine/modifiers.ts` (e.g. an upgrade blocked by the hotel cap).
- Live Aivana drops underscores from enum values (`daybefore`); `canonicalEnum` in `guards.ts` repairs them before zod validation. Keep it.
- There is **no official dataset** (confirmed: the organizers provided no data pack). `server/data/*.json` is our own sample dataset and is the source of truth: approximate distances, fictional hotels, illustrative rates. When adding data, keep it plausible and never let the AI fill in gaps.
- **Dataset frozen (2026-11-21):** 15 venues (all MAC opponents plus Ohio State, Michigan, Penn State), 3+ hotels each. Only add entries; never change existing values. Check with `npm -w server run validate-data`.
- Venue matching (`matchVenue`) prefers the longest matching alias ("Central Michigan" beats Michigan's "michigan"). Don't add a bare `"ohio"` alias: "Bowling Green, Ohio" would match Ohio University.
- Toledo, Eastern Michigan, Akron and Central Michigan are short drives, so Option A is a same-day trip. UMass is a 10h drive; avoid it in demos.
- Venues have an optional `timeZone` (`"ET"` | `"CT"`, omitted = ET); only Northern Illinois is CT. Kickoff (`gameTime`) is stadium-local; engine math runs on the campus (ET) clock (`engine/timeZones.ts`), and each timeline event carries the zone it's shown in.
- Dates without a year roll forward to the next occurrence (in Nov 2026, "October 12" → 2027-10-12).
- With the sample data, a $4,000 hotel cap can't be met; demo with $7,000. In the demo, run "Upgrade hotel quality" **before** the cap: under a $7,000 cap every option is already at the best hotel that fits, so an upgrade is refused.
- Option A uses the latest feasible departure (game day if the drive is ≤ 3h), which differs from what the user requested. This is intentional and shown as a warning.
