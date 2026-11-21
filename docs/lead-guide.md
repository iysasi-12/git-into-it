# Lead Guide

Your job this weekend is **not** to write the most code. It's to:
1. Lock the **dataset** early (L2), then land the one risky integration: the **live Aivana API** (L3).
2. Keep `main` always working and the students unblocked (L4).
3. Make the demo bulletproof (L5, L6 and the team tasks).

If you're writing code while a student has been stuck for 30 minutes, you've got the priorities backwards.

---

## 0. Working in VS Code with Claude Code (without wasting tokens)

The repo already holds everything a fresh Claude Code session needs. You never need to paste in the original chat history.

| File | What it does |
|---|---|
| `CLAUDE.md` | Loaded automatically in **every** session: rules, architecture, commands, team ownership, gotchas. |
| `.claude/commands/review-pr.md` | `/review-pr 12` reviews a student PR in a teaching style and asks you before posting. |
| `.claude/settings.json` | Pre-approves `npm test`, typecheck and read-only `git`/`gh` commands, so you get fewer prompts. |
| `docs/*-guide.md` | Task details for everyone. Point Claude at them instead of explaining. |

### Setup
1. Install the **Claude Code** extension from the VS Code Marketplace and sign in.
2. Open the **repo root** folder (`git-into-it/`) in VS Code, so CLAUDE.md is picked up.
3. Open the Claude Code panel. Check that it knows the project: ask "What are the non-negotiable rules here?" and it should answer from CLAUDE.md.

### Habits that save tokens
- **One task = one session.** When a task is done, start a new conversation (or `/clear`). Old context costs tokens on every message.
- **Point, don't paste.** Use `@server/src/ai/prompts.ts` to attach a file, rather than pasting code or logs. For long logs, save them to a file and attach that.
- **Plan first on risky work.** For L2, L3 and L5, use plan mode (Shift+Tab to toggle) so you approve the approach before any edits.
- **Give the done-when check.** Every prompt below ends with how to verify. Claude stops when it's met, instead of wandering.
- **Update CLAUDE.md when facts change** (dataset swapped, live AI working, new gotcha). That's how the *next* session stays smart without history. You can just say: "update the Current status section of CLAUDE.md".

---

## L1. Kickoff: get everyone running (H0–H1)

**Why:** Every minute a student spends fighting their setup is a minute not learning or building. Doing it together also builds the team.

**Agenda (45 min):**
1. (15 min) Everyone: clone, `npm install` at the root, `npm run dev`, `npm test`. Common fixes: Node older than 20.12; running install inside `client/`; WSL repo cloned under `/mnt/c`.
2. (15 min) Architecture tour on one screen using the README diagram. Three things to land:
   - **"AI talks, app calculates."** Show `engine/` vs `ai/`, and that `engine/` never imports `ai/`.
   - **The server is stateless.** The client sends `request + modifiers[]` every time, and the server recomputes everything.
   - **Mock mode.** Nobody needs an API key except you.
3. (15 min) Each student reads the "Why" and first task in their guide (`docs/student-1-guide.md`, `docs/student-2-guide.md`). Do a 5-minute pairing kickoff with each: open the files together and agree on "done when".

**Done when:** three laptops show the three options for the sample request.

---

## L2. Finish and freeze the sample dataset (H1–H3)

There is no official dataset, so ours in `server/data/*.json` **is** the dataset. It already has 8 venues, 25 hotels, 2 bus types, meal rates and policy, and the app works end to end on it. L2 makes it complete enough that any opponent a judge names works, and then freezes it.

**Why:** A judge will try their own example ("Plan our trip to Toledo"). If that opponent isn't in the data, the demo stalls. Freezing early matters because Student 2's D1 hand calculations and every test depend on these numbers.

**The one rule:** only **add** entries. Never change existing values. Ohio State and the others are used by the tests, the demo script and the students' worked examples.

**Prompt:**
> Our sample dataset in `server/data/` (venues.json, hotels.json, rates.json) is the project's source of truth; there is no official dataset. Add away venues for the rest of the MAC (Akron, Central Michigan, Eastern Michigan, Northern Illinois, Ohio, Toledo, UMass) using the same fields as existing entries: approximate one-way road miles and drive hours from Bowling Green, OH, plus a few aliases each. For each new venue, add one economy, one midscale and one upscale hotel with fictional generic names, following the same naming and rate patterns as the existing hotels. Do NOT change any existing entries. Then run `npm test` (must still pass unchanged) and list what you added in a table.

Then sanity-check it yourself. Do the distances look right on a map? Are cheaper hotels cheaper? Does each venue have enough rooms for about 80 travelers?

**Watch out for:**
- **Be upfront with judges.** Say it plainly: "No dataset was provided, so we built a sample one. Every number comes from it, and the AI never adds its own." That's a strength of the design, not a weakness.
- **Short trips.** Toledo is about 25 miles away, so every option there may be a same-day trip. That's correct behavior and a nice demo of the departure logic.
- After Student 2's D2 merges, run `npm -w server run validate-data` to check the new entries.
- Update the `Current status` section of CLAUDE.md if anything about the data changes.

**Done when:** every MAC opponent appears in the form dropdown, `npm test` passes with no test changes, and you've announced "data is frozen" to the team. Then start L3 early with the hours you saved.

---

## L3. Go live on Aivana (H6–H12)

**Why:** Aivana is a required, core feature. So far it has only run in mock mode. Real models wrap JSON in prose, ignore enums, and are slow, so you want to find that out at H8, not at the demo.

**Setup:** in the repo root, create `.env` from `.env.example` with `AIVANA_API_KEY=...` and `AIVANA_MOCK=false`. It's in `.gitignore`, so **never commit it.** Restart `npm run dev`. The server log should say `Aivana mode: LIVE`.

**Test each task in the UI** and watch the server terminal. A line like `[aivana:recommend] falling back: ...` means the AI call failed and the rules took over. The UI badge shows **Aivana** (good) vs **Rules fallback** (needs a fix).

| Task | How to trigger it | What to check |
|---|---|---|
| parse | *Describe it* → sample → Extract | Fields fill the form; the date and departure are right |
| recommend | Build options | Reasoning cites only real numbers; tradeoffs for A, B and C |
| what-if | Each demo phrase | Correct action and amount; a budget cap uses your number |
| memo | Generate memo | Itinerary times match the computed timeline |

**Prompt when a task falls back:**
> Live Aivana is failing the `<task>` task. Here's the server log line: `<paste one line>`. Look at the prompt in @server/src/ai/prompts.ts and the schema in @server/src/ai/schemas.ts and figure out why the reply doesn't validate. Fix it in prompts.ts (preferred) or loosen the schema only if that stays safe. Don't change the guardrails in guards.ts. Then explain how I can re-test.

**Also measure latency.** Time each call. If recommend + what-if together take more than about 8 seconds, consider:
- skipping the re-recommend after a what-if (the recommendation only updates on "Build"), or
- lowering `AIVANA_TIMEOUT_MS` so the fallback kicks in faster on demo day.

**Done when:** the full demo script runs live with the **Aivana** badge everywhere and no "Rules fallback". Then update CLAUDE.md: "Tested against live Aivana on <date>".

---

## L4. Review every PR within 30 minutes

**Why:** Fast reviews keep the students moving and keep `main` working. Reviews are also where most of their learning happens, so explain *why*, briefly.

**How:** in Claude Code, run `/review-pr <number>`. It reads the PR, checks it against the task's "Done when", runs typecheck and tests, and drafts comments for a first-year. It **asks before posting**. Edit the draft so it sounds like you.

**Your own 2-minute checklist:**
- [ ] Does it do what the task asked, and *only* that?
- [ ] Does `npm run typecheck && npm test` pass?
- [ ] Frontend: no cost math beyond adding up what the server sent.
- [ ] Tests: expected values derived by hand, not copied from output.
- [ ] Can they explain it? Ask one "why" question in person.

**Merge-conflict hotspots:**
- `engine.test.ts`: your L2 vs Student 2's D3.
- `usePlanner.ts` and `App.tsx`: Student 1's F1, F2 and F4.
- `heuristics.ts`: Student 2's D4.

Merge small PRs quickly, and tell the students to `git pull` before each new task.

---

## L5. Deploy (stretch, H16–H20)

**Why:** A public URL lets judges try it on their own phones, and it survives a laptop dying. Skip it if L2 or L3 slipped.

**Simplest approach:** one Node service. Express serves the built client from `client/dist` as well as `/api`.

**Prompt (plan mode):**
> Make the app deployable as a single Node service. In production, @server/src/index.ts should serve `client/dist` as static files, with an SPA fallback to index.html for non-`/api` routes, and use `process.env.PORT`. Add root scripts for production: build (`npm -w client run build`) and start (`npm -w server start`). Keep dev mode (Vite proxy) unchanged. List the env vars I need to set on the host. Verify by running the production build locally.

Then deploy to any Node host (Render, Railway, Fly). Set `AIVANA_API_KEY` and `AIVANA_MOCK=false` in the host's environment settings.

**Done when:** the public URL runs the sample flow on your phone.

---

## L6. Guardrail demo moment (stretch)

**Why:** "The AI never invents numbers" is our strongest technical claim. *Showing* it beats saying it.

**Prompt:**
> For the demo, I want to show the number guardrail working. Add a server-only demo route `POST /api/demo/guardrail` (enabled only when `DEMO_MODE=true`) that runs `scrubText` from @server/src/ai/guards.ts on a sample AI sentence containing one real figure from a computed plan and one invented figure, and returns before/after plus the guard notes. Add a small test. Don't change guard behavior.

Then, in the demo: "Here's an AI sentence with a made-up price. Here's what users actually see."

---

## Phase 2: after the first round of tasks

Status: D1–D5 and F1–F3 are merged. Oliver (Student 1) left after F2. Mika's next tasks are **D6–D9** in `docs/student-2-guide.md`. The idea is to put the team's effort into the remaining risk, live Aivana, and the demo.

Your part:
1. **Keep prompt changes merged before Mika records.** `israel/L3-prompts` is already merged (PR #11). Her recorded answers depend on the exact prompt wording, so merge any further prompt fixes before she starts a capture run.
2. **Give her the API key directly** (a DM), and agree on a call budget. A D6 run is about 25 calls at 15–35 seconds each. Check Aivana's rate limits first.
3. **Treat D6's "known-bad" list as your L3 to-do list.** After each prompt change, flip the fixed fixtures to `"valid"`. If one flips the *wrong* way, your change broke another task.
4. **Answer D7 issues quickly.** Each is a judge's first-try input that fails. Fix parser and prompt issues yourself; she shouldn't touch `prompts.ts`.
5. **Give her the final demo script for D8** as soon as it's settled.
6. **Start T1 (slides) and T4 (backup video) now,** not at H20. The features are done; these are what usually get squeezed at the end.

**F4 and F5 (yours since Oliver left):** cut F4, since options now appear instantly and the slow part is the AI wait, which D9 covers. Do F5 only if there's spare time. If Oliver comes back, give him D9 instead of Mika.

## Running the team

- **Check-ins every 4 hours (5 minutes):** what's done, what's blocked, and what to cut.
- **What to cut first:** L5, L6, F4, F5, D9. Never cut: L3, D6, D8, demo rehearsal.
- **Gates:** data frozen by **H3** (H6 at the latest), live Aivana by **H12**, feature freeze at **H20**. After H20, only bug fixes.
- **Stuck rule:** a student stuck for more than 30 minutes asks you, and you pair for 10 minutes. Guide them; don't take the keyboard.
- Use the shared task doc to tick off tasks as they merge.

## Demo day

**Before you present:**
- [ ] Fresh clone of `main` → `npm install` → `npm run dev` works
- [ ] Live Aivana works on the venue Wi-Fi (or you're on a phone hotspot)
- [ ] **Backup:** set `AIVANA_MOCK=true` in `.env` and restart. The demo runs fully offline in about 10 seconds.
- [ ] Backup video recorded (task T4)
- [ ] Game dates in demo prompts include the year

**Pitch (5 slides max):** the problem → live demo → "AI talks, app calculates" architecture → the guardrail → what's next. Mika presents her own work: the hand-calculated demo numbers (D8) and the live-answer tests (D6). You present the chart and deltas that Oliver built, and credit him.
