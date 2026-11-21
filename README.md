# Away-Game Travel Planner (BGSU Hackathon 2026)

Compares three away-game travel packages (Lowest Cost / Balanced / Comfort), explains the tradeoffs, supports "what-if" chat, and writes a travel memo.

**Aivana** handles the language: it parses requests, recommends an option, interprets what-if chat, and writes the memo.
**Application code** handles every number: travelers, buses, rooms, meals, costs and times. All costs are estimates from the local dataset.

**Live:** https://104-207-138-88.sslip.io (runs live Aivana; every merge to `main` deploys automatically, see [deploy/README.md](deploy/README.md)).

## Run it

```bash
npm install
cp .env.example .env        # set AIVANA_API_KEY and AIVANA_MOCK=false for live AI
npm run dev                 # API :3001, web :5173
npm test                    # engine, guardrail, dataset, rate-limit and saved live-answer tests
npm run typecheck           # server + client
npm -w server run validate-data   # check server/data/*.json
```

With no API key the server runs in **mock mode**, using deterministic heuristics with the same contracts, so the full flow works offline.

Live Aivana is slow (recommend and memo can take 15–45 s), so keep the default timeouts in `.env.example` (30 s / 60 s). Shorter ones cause "Rules fallback" answers.

## What you can do

- **Compare three options** with a cost chart and line-item breakdown. Options appear instantly; Aivana's ★ recommendation loads afterwards, with a seconds counter while it works.
- **Show the math:** click any cost (an option total, a line item, a chart total or a row in the memo's cost table) to see the formula and the dataset values behind it.
- **What-if chat:** "Leave 3 players home", "Cap hotel budget at $7000". Each change is a chip you can undo.
- **Travel memo:** itinerary, departure reminders, meal schedule and a cost table. Print it or use **Copy as text**. Dates are MM/DD/YYYY and times are 12-hour with a time zone (`1:30 PM ET`).

## Architecture

```
client (React)  ──/api──▶  routes ──▶ engine/  (pure calculations, dataset only)
  holds request + modifiers         └─▶ ai/aiService ──▶ aivanaClient (POST /v1/generate)
                                          prompts.ts · schemas.ts · guards.ts · heuristics.ts
```

- **Stateless server.** The client sends `{ request, modifiers[] }`. The server replays the modifiers and recalculates from scratch, so undo just removes one modifier.
- **One-way dependencies.** `engine/` never imports `ai/`. The AI only receives fact sheets the app has computed (`engine/summary.ts`), including precomputed cost differences.
- **Guardrails** (`ai/guards.ts`):
  - Every reply has its JSON extracted and is validated with zod, with one repair retry.
  - Any number in AI text that isn't in the facts is removed ("unverified figure removed").
  - A budget cap must be a number the user actually typed.
  - Cost tables in the UI and memo are rendered from engine data, never from AI text. The memo's itinerary days and times come from the engine timeline too; Aivana only words the activities.
  - In live mode, the AI endpoints are rate-limited per IP (`AI_RATE_LIMIT`, default 60 requests per 10 minutes; one demo run uses about 15).
- **Fallback.** If Aivana fails or returns invalid output, the same heuristics take over (the UI shows "Rules fallback").

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | health check |
| `GET /api/opponents` | venues for the form |
| `POST /api/parse` | free text → structured request (Aivana) |
| `POST /api/plan` | request + modifiers → 3 options (instant, no AI) |
| `POST /api/recommend` | request + modifiers → recommendation (Aivana; slow live, so the client loads it after the options) |
| `POST /api/whatif` | chat → command (Aivana) → recalculated plan |
| `POST /api/memo` | chosen option → memo (Aivana) |

## About the dataset

No official dataset was provided, so the team built a sample one in `server/data/*.json`: 15 away venues (every MAC opponent plus Ohio State, Michigan and Penn State) with approximate distances from Bowling Green, fictional hotels in three tiers (at least 3 per venue), bus types, meal rates and travel policy. Every price is an illustrative estimate, and the app labels costs that way. It is still the **only** source of numbers: the engine calculates from it, and the AI never adds figures of its own.

The dataset is **frozen**: add entries, but don't change existing values. Run `npm -w server run validate-data` after any edit. If new data changes a tested scenario, re-derive the hand-computed expectations in `server/src/engine/engine.test.ts`; don't paste in what the code outputs. Only `loadDataset()` in `server/src/data/dataRepository.ts` knows the file layout.

Venues can have an optional `timeZone` (`"ET"` or `"CT"`, default ET). Only Northern Illinois is CT.

## Calculation rules (`server/src/engine`)

**Costs**
- travelers = players + coaches + staff
- buses = ceil(travelers / bus capacity); a "fewer buses" request is rejected if seats run short
- rooms = ceil(group / occupancy) per group, plus one room per bus driver on overnight trips
- nights: game day = 0, day before = 1, two days before = 2. A drive longer than the policy limit (3 h) forces at least 1 night.
- hotel = cheapest hotel in the option's tier with enough rooms, falling back to the nearest tier. A budget cap picks the best tier that fits under it.
- meals come from the itinerary × travelers × the meal-tier rate
- bus cost = buses × (daily rate × trip days + per-mile rate × round-trip miles)

**Schedule**
- Option A leaves as late as policy allows: game day if the drive is 3 h or less (departing kickoff − drive − 3 h buffer), otherwise the day before. This can differ from the requested departure and is shown as a warning.
- Kickoff is entered in stadium-local time. Schedule math runs on the campus (ET) clock; each itinerary event is shown in the zone where it happens (departure and return in ET, events at a Central-time venue in CT).
- Fixed policy times: report 30 min before departure, breakfast 8:00 AM, dinner 6:30 PM (or 30 min after arrival), pre-game meal 4 h before kickoff, leave the hotel 3 h before kickoff, buses home 4.5 h after kickoff. Times round to 15 minutes.

## Demo script

1. *Describe it* → "Use sample" → Extract details → Build travel options
2. Point out the ★ recommendation and the tradeoffs, then click a cost to show the math
3. What-ifs: "Leave 3 players home" → "Use one fewer bus" (rejected: not enough seats) → "Cap hotel budget at $7000" → "Upgrade hotel quality"
4. Undo a chip, then Generate travel memo → Copy as text or Print
