# Away-Game Travel Planner (BGSU Hackathon 2026)

Compares three away-game travel packages (Lowest Cost / Balanced / Comfort), explains the tradeoffs, supports "what-if" chat, and writes a travel memo.

**Aivana** handles the language: it parses requests, recommends an option, interprets what-if chat, and writes the memo.
**Application code** handles every number: travelers, buses, rooms, meals, costs and times. All costs are estimates from the local dataset.

## Run it

```bash
npm install
cp .env.example .env        # set AIVANA_API_KEY and AIVANA_MOCK=false for live AI
npm run dev                 # API :3001, web :5173
npm test                    # calculation + guardrail tests
```

With no API key the server runs in **mock mode**, using deterministic heuristics with the same contracts, so the full flow works offline.

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
  - Cost tables in the UI and memo are rendered from engine data, never from AI text.
- **Fallback.** If Aivana fails or returns invalid output, the same heuristics take over (the UI shows "Rules fallback").

| Endpoint | Purpose |
|---|---|
| `GET /api/opponents` | venues for the form |
| `POST /api/parse` | free text → structured request (Aivana) |
| `POST /api/plan` | request + modifiers → 3 options + recommendation |
| `POST /api/whatif` | chat → command (Aivana) → recalculated plan |
| `POST /api/memo` | chosen option → memo (Aivana) |

## Swapping in the official dataset

Placeholder data lives in `server/data/*.json`. Replace those files and adapt only the mapping in `server/src/data/dataRepository.ts` → `loadDataset()`. Then update the hand-computed expectations in `server/src/engine/engine.test.ts`.

## Calculation rules (`server/src/engine`)

- travelers = players + coaches + staff
- buses = ceil(travelers / bus capacity); a "fewer buses" request is rejected if seats run short
- rooms = ceil(group / occupancy) per group, plus one room per bus driver on overnight trips
- nights: game day = 0, day before = 1, two days before = 2. A drive longer than the policy limit forces at least 1 night.
- hotel = cheapest hotel in the option's tier with enough rooms, falling back to the nearest tier. A budget cap picks the best tier that fits under it.
- meals come from the itinerary × travelers × the meal-tier rate
- bus cost = buses × (daily rate × trip days + per-mile rate × round-trip miles)

## Demo script

1. *Describe it* → "Use sample" → Extract details → Build travel options
2. Point out the ★ recommendation and the tradeoffs, then open a cost breakdown
3. What-ifs: "Leave 3 players home" → "Use one fewer bus" (rejected: not enough seats) → "Cap hotel budget at $7000" → "Upgrade hotel quality"
4. Undo a chip, then Generate travel memo → Print
