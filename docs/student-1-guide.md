# Student 1 Guide: Frontend

> **Status (2026-11-21):** F1 and F2 were done by Oliver, who has since left the team. The lead did F3. F4 is cut, and F5 is optional for the lead. If you're picking up frontend work now, start with **D9** (AI wait counter) in `docs/student-2-guide.md`.

Welcome! You own **what the judges see.** Judges spend about three minutes on our project, and most of that time they're looking at the screen. A clear chart and instant feedback after a what-if can win the room.

You'll also learn the core ideas of React (components, props, state) by building real features. Those ideas carry over to almost every frontend job.

---

## 0. Setup (first 30 minutes)

You need **Node.js 20.12 or newer** (22 LTS recommended).

```bash
node -v            # should print v20.12+ / v22 / v24
git clone <repo-url>
cd git-into-it
npm install        # run ONLY here at the root, never inside client/ or server/
npm run dev        # opens the app at http://localhost:5173
```

You don't need an API key. Without one the server runs in **mock mode**, which uses built-in rules instead of the Aivana API, so the whole app works offline.

> On Windows with WSL, clone into your Linux home folder (`~/`), not `/mnt/c/...`. Otherwise hot reload may not notice your changes.

**Try it once before reading any code:** click *Describe it* → *Use sample* → *Extract details* → *Build travel options*. Then try "Leave 3 players home" in the what-if chat, open a cost breakdown, and generate a memo. You're about to make all of this better.

**Recommended:** install the [React Developer Tools](https://react.dev/learn/react-developer-tools) browser extension. It lets you click any component and see its props and state.

### How the frontend is organized

```
client/src/
  App.tsx                  ← page layout: left column (form + chat), right column (results)
  hooks/usePlanner.ts      ← ALL app state + actions (generatePlan, sendWhatIf…). The "brain".
  api/client.ts            ← talks to the server. You probably won't need to change it.
  lib/format.ts            ← money(), prettyDate(), prettyTime() helpers
  components/
    OptionCard.tsx         ← one travel option (A, B or C)
    RecommendationPanel.tsx
    WhatIfChat.tsx
    MemoView.tsx           ← the travel memo popup
    RequestPanel.tsx       ← the form + "Describe it" tab
    ui.tsx                 ← small reusable pieces: Button, Card, Spinner…
shared/src/types.ts        ← the shape of all data. Read TravelOption and LineItem!
```

**The one rule of this project:** the frontend **never calculates costs.** Every price comes from the server. You can *add up* numbers the server already sent (for a chart, or a difference between two plans). You never invent a rate or estimate a price.

### Git workflow for every task

```bash
git checkout main && git pull
git checkout -b <your-name>/F1        # one branch per task
# ...work...
npm run typecheck                     # must pass before a PR
git add -A && git commit -m "F1: ..."
git push -u origin <your-name>/F1     # then open a Pull Request on GitHub
```

In each PR, add a **screenshot** and explain **what you changed and why** in your own words. If you used AI help, that's fine, but you should be able to explain every line.

**Stuck for 30 minutes? Ask the lead.** That's expected, not a failure.

---

## React in 2 minutes (the three ideas you'll use)

1. **Components** are functions that return what to show:
   ```tsx
   function Hello({ name }: { name: string }) {
     return <p>Hello {name}</p>;
   }
   ```
2. **Props** are the inputs a parent passes to a component: `<Hello name="Falcons" />`. Look at how `App.tsx` passes `option={o}` into `<OptionCard>`.
3. **State** is data that changes over time. When you change it, React re-draws the screen:
   ```tsx
   const [open, setOpen] = useState(false);   // see OptionCard.tsx: "Show cost breakdown"
   ```

That's honestly most of it. Everything below is practice with these three ideas.

---

## F1. Cost breakdown chart (H1–H6)

**Why:** Three big dollar totals are hard to compare. A chart shows **where** the money goes at a glance. For example, Comfort costs more mostly because of the hotel, not the bus. Judges understand a picture faster than a table, and it makes the what-if chat feel alive when the bars move.

**What to build:** a new component `client/src/components/CostChart.tsx`. It shows one horizontal bar per option, each split into three colored segments: **bus**, **hotel**, **meals**.

```
Option A  ███████░░░░░░░░░░░░░░░░░░░░░  $6,674
Option B  ███████████▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒░  $21,395
Option C  █████████████▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒  $30,474
          ■ Bus  ▓ Hotel  ▒ Meals
```

### Steps

1. Read the `LineItem` and `TravelOption` types in `shared/src/types.ts`. Each option has `lineItems`, and each item has a `category` (`"bus" | "hotel" | "meals"`) and a `total`.

2. Start from this skeleton and fill in the TODOs:

   ```tsx
   import type { TravelOption } from "@app/shared";
   import { money } from "../lib/format";
   import { Card } from "./ui";

   // Add up an option's line items for one category.
   function sumCategory(option: TravelOption, category: "bus" | "hotel" | "meals"): number {
     // TODO: use .filter() to keep items in this category, then .reduce() to add up their totals
     return 0;
   }

   export function CostChart({ options }: { options: TravelOption[] }) {
     // The most expensive option's bar should be 100% wide; others are scaled to it.
     const max = Math.max(...options.map((o) => o.totalCost));

     return (
       <Card title="Where the money goes (estimates)">
         {options.map((o) => (
           <div key={o.id} className="mb-2 flex items-center gap-3 text-sm">
             <span className="w-20 shrink-0 font-medium">Option {o.id}</span>
             <div className="flex h-5 flex-1 overflow-hidden rounded bg-stone-100">
               {/* TODO: three <div>s, one per category, each with a different bg color */}
               <div className="bg-ink" style={{ width: `${(sumCategory(o, "bus") / max) * 100}%` }} />
             </div>
             <span className="w-20 shrink-0 text-right">{money(o.totalCost)}</span>
           </div>
         ))}
         {/* TODO: a small legend: Bus / Hotel / Meals with matching color squares */}
       </Card>
     );
   }
   ```

3. Show it in `App.tsx`, right above the three option cards: `<CostChart options={plan.options} />`.

> ⚠️ **Important Tailwind gotcha:** Tailwind can't build class names at runtime. `className={`w-[${pct}%`]}` will **not** work. For widths computed from data, use `style={{ width: ... }}` like the skeleton does. Colors are fixed, so classes like `bg-brand` work fine.

**Bonus:** add a `title` attribute to each segment, like `title={`Hotel: ${money(...)}`}`, so hovering shows the exact amount.

**Done when:** the chart shows all three options, segment widths add up to each total, and the bars resize after "Leave 3 players home." **You'll learn:** props, `.map()`, `.filter()` and `.reduce()`, inline styles vs. classes.

---

## F2. "What changed" deltas (H6–H11)

**Why:** When a coach types "Leave 3 players home", the numbers change, but right now you have to remember the old totals to see by how much. Showing **▼ $643** in green right on the card makes the what-if feature obvious in a demo. This is the "wow" moment.

**You'll learn:** React state that lives in a custom hook, and passing data down through props.

### Steps

1. **Remember the previous plan.** In `client/src/hooks/usePlanner.ts`, add a new piece of state next to `plan`:
   ```ts
   const [previousPlan, setPreviousPlan] = useState<PlanResult | null>(null);
   ```
2. **Save it at the right moment.** Find every place that calls `setPlan(...)`:
   - In `sendWhatIf`, and in `replan` when it's called from `removeModifier` (undo), call `setPreviousPlan(plan)` **before** setting the new plan.
   - In `generatePlan` (a brand-new trip), reset it with `setPreviousPlan(null)`. Otherwise you'd compare two different trips!
   - Return `previousPlan` from the hook, at the bottom of the file.

   > 🤔 Think about it: inside `sendWhatIf`, why does `plan` still hold the *old* plan at the moment you call `setPreviousPlan(plan)`? Ask the lead if you're not sure. It's a great React question.

3. **Pass it to each card.** In `App.tsx`, find the matching option in `previousPlan` by `id` and pass its total:
   ```tsx
   previousTotal={planner.previousPlan?.options.find((p) => p.id === o.id)?.totalCost}
   ```
4. **Show it.** In `OptionCard.tsx`, add `previousTotal?: number` to `Props`. Next to the big total:
   - if the total went **down**: green `▼ $643`
   - if it went **up**: red `▲ $1,200`
   - if it didn't change, or there's no previous total: show nothing

**Done when:** "Leave 3 players home" shows a green drop on all three cards, "Upgrade hotel quality" shows red increases, and building a new trip from the form clears them.

---

## F3. Mobile pass (H11–H14)

**Why:** Judges often pull up the app on their phones, and "responsive UI" is one of our requirements. A sideways-scrolling page looks broken.

**You'll learn:** browser DevTools and Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`).

### Steps

1. In Chrome, open DevTools (F12) → click the phone/tablet icon (device toolbar) → choose **iPhone SE (375px wide)**.
2. Walk through the whole demo: form → options → open a cost breakdown → what-if chat → memo.
3. Look for anything that **scrolls sideways**, gets cut off, or is too small to tap. Likely suspects:
   - the itinerary table in `MemoView.tsx` (it uses `whitespace-nowrap`)
   - long hotel names in `OptionCard.tsx`
   - your new `CostChart` labels
4. Fix with Tailwind. Common tools: `flex-wrap`, `break-words`, `min-w-0`, hiding a column on small screens with `hidden sm:table-cell`, or `overflow-x-auto` on a wrapper as a last resort.

**Done when:** the full demo works at 375px with no sideways scrolling. Put before/after screenshots in your PR.

---

## F4. Loading skeletons (H14–H16)

**Why:** The first plan takes a moment, especially with the live AI. A spinner says "wait." Gray placeholder cards in the shape of the result make the app feel faster, and the page doesn't jump when results arrive.

### Steps

1. In `App.tsx`, find the block that shows *"Calculating options and asking Aivana…"* (`loading.plan && !plan`).
2. Replace it with three gray cards in the same grid as the real cards (`grid gap-4 md:grid-cols-3`).
3. Inside each card, add a few gray bars of different widths and the Tailwind class `animate-pulse`:
   ```tsx
   <div className="h-8 w-2/3 rounded bg-stone-200" />
   ```
   Make it roughly match the real `OptionCard` layout: a label, a big total, a few detail lines, a button.

**Done when:** the placeholders appear while loading and the real cards replace them without the page jumping. (To see it longer, throttle the network in DevTools → Network → "Slow 3G".)

---

## F5. Stretch: "Copy memo as text"

In `MemoView.tsx`, add a button next to *Print* that builds a plain-text version of the memo (title, summary, itinerary lines, reminders) and copies it with:
```ts
await navigator.clipboard.writeText(text);
```
Show "Copied!" for 2 seconds afterwards. Hint: `useState` + `setTimeout`. Coaches love pasting into email.

---

## Demo time (H20+)

At the demo **you present the part you built.** Prepare 60 seconds on:
1. The cost chart: "Comfort costs more mainly because of ___." Read it off your chart.
2. A live what-if: type it, then point at the green/red deltas you built.
3. (If F3 is done) Show the app on your phone.

You've got this. Ask questions early and often. 🧡
