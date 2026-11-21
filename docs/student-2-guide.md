# Student 2 Guide: Data & Tests

Welcome! You own the part of the project that makes our core promise true:

> **Every number on screen is correct, and it comes from the dataset — never from the AI.**

Judges will hear us say "the AI never does the math." Your work is the proof. If a hotel cost or bus count is wrong, the whole pitch falls apart, so this role matters a lot, even though it's less flashy than the UI.

You'll also come out of this weekend knowing how to read a real codebase, write unit tests, and use schemas to catch bad data. Those skills show up in every internship.

---

## 0. Setup (first 30 minutes)

You need **Node.js 20.12 or newer** (22 LTS recommended).

```bash
node -v            # should print v20.12+ / v22 / v24
git clone <repo-url>
cd git-into-it
npm install        # run ONLY here at the root, never inside client/ or server/
npm run dev        # opens the app at http://localhost:5173
npm test           # should say all tests passed
```

You don't need an API key. Without one the server runs in **mock mode**, which uses built-in rules instead of the Aivana API.

> On Windows with WSL, clone into your Linux home folder (`~/`), not `/mnt/c/...`. It's much faster.

**Try it once before reading any code:** click *Describe it* → *Use sample* → *Extract details* → *Build travel options*. Then type "Leave 3 players home" in the what-if chat. Look at a cost breakdown. That is the system you're about to test.

### How the code is organized (only the parts you need)

```
server/
  data/                      ← the dataset (JSON). Every price and distance lives here.
  src/
    data/dataRepository.ts   ← loads the JSON into typed objects
    engine/                  ← the calculator. Pure functions, no AI. YOUR MAIN AREA.
      calculator.ts          ← small math helpers (buses, rooms, meals…)
      profiles.ts            ← what makes Option A / B / C different
      optionBuilder.ts       ← puts it all together into 3 options
      engine.test.ts         ← tests for the engine
    ai/
      heuristics.ts          ← backup rules that turn chat into commands
      guards.test.ts         ← tests for the AI guardrails + those rules
shared/src/types.ts          ← TypeScript types used everywhere (read Dataset & TravelOption)
```

### Git workflow for every task

```bash
git checkout main && git pull
git checkout -b <your-name>/D1        # one branch per task
# ...work...
npm run typecheck && npm test         # both must pass before a PR
git add -A && git commit -m "D1: ..."
git push -u origin <your-name>/D1     # then open a Pull Request on GitHub
```

In each PR description, explain **what you changed and why** in your own words. If you used AI help, that's fine, but you should be able to explain every line.

**Stuck for 30 minutes? Ask the lead.** That's expected, not a failure.

---

## D1. Hand-calculate two trips (H1–H4)

**Why:** You can't test a calculator unless you know the right answer on your own. Doing it by hand also teaches you the rules before you read the code. Your numbers become the trusted answers that our tests and demo are checked against.

### Learn the method from a worked example first

This trip is already in `engine.test.ts`, so you can check your understanding against it.

**Trip:** Ohio State, game day Saturday, **65 players, 8 coaches, 4 staff**, leave the day before at 14:00.
**Option B (Balanced):** midscale hotel, coaches in single rooms, standard meals, standard bus.

Look up the numbers in `server/data/venues.json`, `hotels.json` and `rates.json`:

| Step | Rule | Math | Result |
|---|---|---|---|
| Travelers | players + coaches + staff | 65 + 8 + 4 | **77** |
| Buses | ceil(travelers ÷ bus capacity) | ceil(77 ÷ 56) | **2** |
| Nights | day before = 1 | | **1** |
| Trip days | nights + 1 | | **2** |
| Round-trip miles | distance × 2 | 125 × 2 | **250** |
| Bus charter | buses × days × daily rate | 2 × 2 × $1,100 | **$4,400** |
| Bus mileage | buses × miles × per-mile rate | 2 × 250 × $3.25 | **$1,625** |
| Rooms | players ÷ 2 (round up) + coaches ÷ 1 + staff ÷ 2 + 1 per bus driver | 33 + 8 + 2 + 2 | **45** |
| Hotel | cheapest midscale hotel with ≥ 45 rooms free × nights | 45 × $179 × 1 | **$8,055** |
| Meals | Day before: dinner (leaving before 19:00; lunch only if leaving before 11:00). Game day: breakfast, pre-game lunch, post-game dinner. | dinner 2 × 77 × $30 = $4,620 · breakfast 77 × $15 = $1,155 · lunch 77 × $20 = $1,540 | **$7,315** |
| **Total** | | | **$21,395** |

The test file expects `B.totalCost` to be `21395`. Your math matches the code. 🎉

### Your turn

In a spreadsheet (Google Sheets is fine), calculate **all three options (A, B, C)** for two trips:

1. **A short trip:** pick a venue with a drive under 3 hours.
2. **A long trip:** pick a venue with a drive over 3 hours (Buffalo or Penn State in the sample data).

Use the data in `server/data/`. There's no official dataset; this sample one is what the app uses. The lead may *add* more venues early on, but existing numbers won't change, so your work stays valid.

Things that differ per option. Read `server/src/engine/profiles.ts` for the details:
- **Option A** leaves as late as possible. For a short drive that means *game day*: 0 nights, no hotel, and only lunch + dinner. For a long drive it must still leave the day before.
- **Option C** uses the premium bus, which has **50 seats, not 56**. Does that change the bus count?
- Room sharing (occupancy) differs per option, and so do the meal tier and hotel tier.

**Done when:** six totals (3 options × 2 trips) are in the sheet with every step shown, and you've shared the sheet with the lead.

> 💡 If your total doesn't match the app, **that's interesting, not bad.** Either you misread a rule (you learn something) or the code has a bug (you found one!). Write down which step differs.

---

## D2. Dataset validation script (H4–H8)

**Why:** The engine trusts the dataset completely. If a hotel points at a venue ID that doesn't exist, or a rate is negative, the app silently shows wrong numbers. A validation script catches that the moment the data changes. This matters because we built the dataset ourselves, by hand, and the lead is adding more venues to it. Typos are guaranteed.

**You'll learn:** [zod](https://zod.dev) schemas, which describe what valid data looks like. We already use zod in `server/src/validation.ts` and `server/src/ai/schemas.ts`. Read those first for examples.

### Steps

1. Create `server/src/data/validateData.ts`. A starter shape with TODOs for you:

   ```ts
   import { z } from "zod";
   import { loadDataset } from "./dataRepository.js";

   const VenueSchema = z.object({
     id: z.string().min(1),
     school: z.string().min(1),
     distanceMiles: z.number().positive(),
     driveHours: z.number().positive(),
     // TODO: the rest of the Venue fields (see shared/src/types.ts)
   });

   // TODO: HotelSchema, BusTypeSchema, MealRates, TravelPolicy

   const errors: string[] = [];
   const ds = loadDataset();

   // 1. Shape checks: does every record match its schema?
   ds.venues.forEach((v, i) => {
     const r = VenueSchema.safeParse(v);
     if (!r.success) errors.push(`venues[${i}] (${v.id}): ${r.error.issues.map((x) => x.message).join(", ")}`);
   });
   // TODO: same for hotels, busTypes

   // 2. Cross checks: do the records agree with each other?
   // TODO: no duplicate venue ids or hotel ids
   // TODO: every hotel.venueId exists in venues
   // TODO: the bus type ids used in engine/profiles.ts ("standard-coach", "premium-coach") exist
   // TODO (warning, not error): every venue has at least one hotel of each tier

   if (errors.length) {
     console.error(`❌ ${errors.length} problem(s):\n- ${errors.join("\n- ")}`);
     process.exit(1);
   }
   console.log(`✅ Dataset OK: ${ds.venues.length} venues, ${ds.hotels.length} hotels`);
   ```

2. Add a script to `server/package.json` under `"scripts"`:
   ```json
   "validate-data": "tsx src/data/validateData.ts"
   ```
   Run it with `npm -w server run validate-data`.

3. **Prove it works by breaking things on purpose.** Temporarily change a hotel's `venueId` to `"nowhere"`, or a rate to `-5`. The script should fail with a clear message. Then undo the change.

**Done when:** it passes on our dataset (including any venues the lead added), fails clearly on each broken case you tried, and your PR lists the cases you tested.

---

## D3. Edge-case tests (H8–H12)

**Why:** Bugs hide at the boundaries: exactly full, zero, one more than full. A demo that crashes when a coach types "0 staff" is a bad look. Tests make sure that never happens, and they keep protecting us when someone changes the code at 3 AM.

**You'll learn:** [Vitest](https://vitest.dev) unit tests. Open `server/src/engine/engine.test.ts`. The existing tests are your template.

Run tests in watch mode while you work. They re-run every time you save:
```bash
npm -w server exec vitest
```

### Write at least these 5 tests

Work out each expected value **by hand first** (like D1), then write the test.

| Case | Setup hint | What to check |
|---|---|---|
| Exactly one full bus | `{ ...base, players: 50, coaches: 4, staff: 2 }` = 56 | Option B uses **1** bus. And Option C? (Premium seats 50!) |
| One over a full bus | 57 travelers | Option B uses **2** buses |
| Zero staff | `staff: 0` | `rooms.staff` is 0, and nothing crashes |
| Two nights | `departure: "two_days_before"` | Option B has the right number of meals (hint: count them per day) |
| Budget cap nothing fits | modifier `{ action: "set_hotel_budget_cap", amount: 100, explanation: "" }` | a warning mentions "over budget" |

Example of the pattern:
```ts
it("56 travelers fit on one standard bus", () => {
  const p = buildPlan({ ...base, players: 50, coaches: 4, staff: 2 });
  expect(p.options[1].buses.count).toBe(1);
});
```

**If a test fails and you think the code is wrong:** don't fix the engine yourself. Show the lead your hand calculation. Finding a real bug is a win; write it up in the PR.

**Done when:** at least 5 new tests are green and `npm test` passes.

---

## D4. Teach the what-if parser more phrasings (H12–H16)

**Why:** When the live Aivana API works, it understands almost any phrasing. But if the Wi-Fi or the API fails during judging, the app falls back to `server/src/ai/heuristics.ts`, a set of regex rules. Right now those rules only know a few phrasings. Your job is to make the backup good enough that judges never notice the fallback.

**You'll learn:** regular expressions and **test-driven development** (TDD): write a failing test first, then make it pass.

### Steps

1. Collect **10 phrasings** a coach might actually type. Ask friends or teammates for help. For example:
   - "drop 5 guys from the roster"
   - "lose two assistant coaches"
   - "what if we add a trainer"
   - "add an equipment manager"
   - "we can only spend 6k on hotels"

   (All five of these currently fail. Some of yours may already pass. That's fine; keep them as tests anyway.)
2. Open `server/src/ai/guards.test.ts` and find the `it.each([...])` table. Add your phrasings with the command they *should* produce:
   ```ts
   ["Drop 5 guys from the roster", { action: "adjust_players", amount: -5 }],
   ```
3. Run the tests and watch them fail (red).
4. Edit the regexes in `heuristicWhatIf()` in `heuristics.ts` until they pass (green). Use [regex101.com](https://regex101.com) to try patterns out.
5. Make sure the **old** cases still pass. Don't break "Leave 3 players home"!

**Done when:** all 10 new phrasings pass, the old ones still pass, and your PR explains any phrasing you decided *not* to support and why.

---

## D5. Stretch: add a brand-new what-if action (pair with the lead)

Only start this after D1–D4 are merged. Example: `set_player_occupancy` ("put 3 players per room").

**Why:** This one change touches every layer, from AI schema to prompt to modifier to engine to tests. It's the best way to understand how the whole system fits together. Plan it with the lead before writing code.

Files involved: `shared/src/types.ts`, `server/src/ai/schemas.ts`, `server/src/ai/prompts.ts`, `server/src/engine/modifiers.ts`, `server/src/engine/optionBuilder.ts`, `server/src/ai/heuristics.ts`, plus tests.

---

# Phase 2: after D1–D5

D1–D5 are done. Nice work! The app's features are basically finished. The biggest remaining risk is the **live Aivana API**: it's slow (15–35 seconds per call) and doesn't always answer in the exact format we ask for. The lead is tuning the prompts now. Your next tasks make that work safer and make the demo hard to break.

**One rule for all of Phase 2:** don't edit `prompts.ts`, `schemas.ts`, `aiService.ts` or `aivanaClient.ts` in `server/src/ai/`. The lead is changing them. You may *import* from them, and if you think one needs a change, tell the lead.

Do them in order: D6 → D7 → D8, and D9 if there's time.

---

## D6. Record real Aivana answers as tests

**Why:** Every bug the lead has fixed so far came from seeing one real answer that didn't fit. For example, Aivana writes `"adjustplayers"` instead of `"adjust_players"`, and echoes field names like "totalCost 21395" into its text. Right now the only way to find those is to click through the app and read the server log. You'll build a tool that captures real answers in bulk and turns them into tests. Then when the lead changes a prompt to fix one task, the tests show right away whether it broke another. This is called a **regression suite**, and real teams rely on them.

**Before you start:**
- Pull the latest `main` first. The lead's prompt fixes are merged there, and your recordings depend on the exact prompt wording. Before each later capture run, pull again and ask the lead whether more prompt changes are coming.
- Ask the lead for the API key **directly** (a DM, not git or the group chat). Put it in your own `.env` at the repo root: copy `.env.example`, set `AIVANA_API_KEY=...` and `AIVANA_MOCK=false`. **Never commit `.env`.** It's already in `.gitignore`; check that `git status` doesn't list it.
- Each live call takes 15–35 seconds and may cost money or hit a rate limit. Keep each run to about 25 calls, run them one at a time, and ask the lead before running it again.

### Steps

1. **Read how the app calls the AI.** Open `server/src/ai/aiService.ts`. Each task (`parseRequest`, `recommend`, `interpretWhatIf`, `writeMemo`) builds a prompt with a function from `prompts.ts`, sends it with `generate()` from `aivanaClient.ts`, and checks the answer with `callStructured()`. Make sure you can explain each step before writing code.

2. **Write a capture script:** `server/scripts/captureLive.ts`. It builds each prompt the *same way* `aiService.ts` does, calls `generate()`, and saves the **raw** answer text before any repair or retry. That first answer is the one that shows what goes wrong. A starter shape:

   ```ts
   import { writeFileSync } from "node:fs";
   import { generate } from "../src/ai/aivanaClient.js";
   import { prompts } from "../src/ai/prompts.js";
   import { getDataset } from "../src/data/dataRepository.js";
   import { buildPlan } from "../src/engine/optionBuilder.js";
   import { planFacts, memoFacts } from "../src/engine/summary.js";

   type Capture = { task: "parse" | "recommend" | "whatif" | "memo"; input: string; answer: string; capturedAt: string };
   const out: Capture[] = [];

   const base = { opponentId: "ohio-state", gameDate: "2027-10-09", players: 65, coaches: 8, staff: 4,
                  departure: "day_before" as const, earliestDepartureTime: "14:00", specialRequests: [] };
   const plan = buildPlan(base);

   // TODO: parse. For 5 free-text requests, build the prompt exactly like aiService.parseRequest
   //       (it passes today's date and the list of venue school names).
   // TODO: whatif. For each demo phrase + 8 of your D4 phrasings, build the context exactly
   //       like aiService.interpretWhatIf does, then prompts.interpretWhatIf(message, context).
   // TODO: recommend. prompts.recommend(planFacts(plan)), once or twice.
   // TODO: memo. prompts.memo(memoFacts(plan, plan.options[1])), once.

   async function capture(task: Capture["task"], input: string, prompt: string) {
     console.log(`→ ${task}: ${input}`);
     const answer = await generate(prompt, 60_000); // live calls are slow; allow 60 s
     out.push({ task, input, answer, capturedAt: new Date().toISOString() });
   }

   // ...call capture() for each case, one at a time (await each)...

   writeFileSync("src/ai/fixtures/live-answers.json", JSON.stringify(out, null, 2));
   console.log(`Saved ${out.length} answers.`);
   ```

   Add a script to `server/package.json`: `"capture-live": "tsx scripts/captureLive.ts"`, and run it with `npm -w server run capture-live`. Note that `npm run typecheck` won't check this file, because `server/tsconfig.json` only includes `src/`. Ask the lead whether to add `scripts` to `include`.

3. **Write the test:** `server/src/ai/liveAnswers.test.ts`. For every saved answer, use the same steps the app uses: `extractJson(answer)` from `guards.ts`, then the matching schema's `safeParse` (`ParsedRequestSchema`, `RecommendationSchema`, `WhatIfCommandSchema` or `MemoSchema` from `schemas.ts`). Use `it.each` like in D4, so each answer gets its own test name.
   - **For what-if answers,** also check the *meaning*: "Leave 3 players home" should give `adjust_players` with `-3`. Put the expected command next to each phrase in the script, and save it in the fixture.
   - **For recommend and memo answers,** run `scrubDeep(...)` with `allowedNumbers(facts)` and check how many guard notes it produces. A note means the AI wrote a number that isn't in our facts. Report those to the lead even if the test passes.

4. **Handling failures.** Tests that fail on real answers are the *point*, but `main` must stay green. Add an `expected: "valid" | "known-bad"` field to each fixture. Mark failing answers `"known-bad"` and test that they *do* fail (so when the lead fixes the problem, the test tells you to flip it). In your PR, list every known-bad answer with a one-line note on what's wrong. That list is the lead's to-do list.

**Done when:** about 25 real answers are saved, the test runs in `npm test` without calling the API (it only reads the JSON file), `main` stays green, and your PR lists the known-bad answers. **You'll learn:** writing a script against real code, test fixtures, regression testing, and handling secrets safely.

---

## D7. Try what judges will type

**Why:** The first thing a judge does is type their *own* request, not our demo script. If it fails, the demo stalls in front of them. You'll find those failures before they do.

### Steps

1. Write **20 free-text requests** a judge might type into *Describe it*. Mix them up on purpose:
   - different opponents, including Toledo (a same-day trip) and Buffalo (a long drive)
   - misspellings and nicknames: "Ohio st", "the Rockets", "WMU"
   - missing details: no coach count, no date
   - relative dates: "next Saturday", "the 14th"
   - a different sport: "basketball, 15 players, 4 coaches"
   - a mess: two requests in one, or something that isn't a trip at all
2. Create `docs/judge-inputs.md` with a table: `# | Input | Expected | Got (mock) | Got (live) | Issue`.
3. Run each one through the app in **mock mode** first (no key needed). Then run the 10 most interesting ones **live** (they're slow, so be choosy). Write down what filled into the form, what was missing, and whether "Build travel options" worked.
4. For each problem, open a GitHub issue with the input, what you expected, and what happened. Don't fix parser or prompt bugs yourself. Tag the lead.

**Done when:** 20 rows are filled in, and every problem has an issue linked from the table. **You'll learn:** exploratory testing and writing clear bug reports. A good bug report is a superpower.

---

## D8. Check the demo numbers by hand

**Why:** During the demo, the presenter will say things like "leaving 3 players home saves $643 on Option B." If a judge asks "how do you know that's right?", you should be able to show the hand calculation. You already know how from D1.

### Steps

1. Ask the lead for the **final demo script**: the trip and the exact what-ifs in order. The README's demo script is a starting point, but it may have changed.
2. In your D1 spreadsheet, add a tab per step: the starting plan, then the plan after each what-if. For each option, write the totals, bus count, rooms and hotel name the screen should show.
3. Run the demo in the app and compare. Any difference is either a misread rule or a bug. Either way, tell the lead right away.
4. Make a one-page "cheat sheet" with the key numbers per step, for whoever presents.

**Done when:** every number in the demo script is checked, and the cheat sheet is shared with the team.

---

## D9. Stretch: show how long the AI has been thinking (your first frontend task)

**Why:** Live Aivana calls take 15–35 seconds. During that wait, a still spinner looks like a crash to a judge. A counter like *"Aivana is thinking… 12s"* shows the app is working.

**You'll learn:** React's `useEffect` and cleanup, which are needed any time you use a timer.

### Steps

1. In `client/src/components/ui.tsx`, add a small hook that counts seconds while something is loading:
   ```tsx
   export function useElapsedSeconds(active: boolean): number {
     const [seconds, setSeconds] = useState(0);
     useEffect(() => {
       if (!active) { setSeconds(0); return; }
       const id = setInterval(() => setSeconds((s) => s + 1), 1000);
       return () => clearInterval(id); // cleanup: stop the timer when loading ends
     }, [active]);
     return seconds;
   }
   ```
   Ask yourself: what would happen without the `return () => clearInterval(id)` line?
2. Use it in each place the app waits on the AI:
   - `App.tsx`: the "Aivana is reviewing the options…" card (`loading.recommend`)
   - `WhatIfChat.tsx`: the "Recalculating…" line (`loading.whatif`)
   - `RequestPanel.tsx`: the *Extract details* button (`loading.parse`)
   - the memo: `loading.memo` (the *Generate travel memo* button in `OptionCard.tsx`)
3. Show the count only after about 3 seconds, so fast mock-mode responses don't flash a counter.

**Done when:** all four waits show a counter live, nothing flickers in mock mode, and `npm run typecheck` passes. Add a screenshot to the PR.

---

## Demo time (H20+)

At the demo **you present the part you built.** Prepare 60 seconds on:
1. "The AI never calculates. Here's how we prove the math is right." Show your hand calculation next to the app.
2. One edge case your tests catch.
3. (If D4 is done) Turn off the API and show the what-if chat still working.

You've got this. Ask questions early and often. 🧡
