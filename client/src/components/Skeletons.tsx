import {Card, Spinner, useElapsedSeconds } from "./ui";

// Gray placeholders in the shape of the real results, so the page doesn't jump when they arrive.

const PULSE = "animate-pulse motion-reduce:animate-none";

function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-stone-200 ${className}`} />;
}

/** Shaped like an OptionCard: label, title, big total, detail rows (some wrap), breakdown link, memo button. */
function OptionCardSkeleton() {
  // [first-line width, second-line classes or null]: Depart, Travelers, Buses, Hotel, Rooms, Meals.
  // Depart and Buses only wrap in the narrow 3-column layout (md+); Hotel wraps everywhere.
  const rows: [string, string | null][] = [
    ["w-3/4", "hidden w-1/3 md:block"],
    ["w-1/4", null],
    ["w-2/3", "hidden w-1/3 md:block"],
    ["w-4/5", "w-1/2"],
    ["w-1/3", null],
    ["w-1/2", null],
  ];
  return (
    <div className={`flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm ${PULSE}`}>
      <Bar className="mb-2 h-3 w-16" />
      <Bar className="mb-4 h-6 w-1/2" />
      <Bar className="mb-2 h-9 w-2/3" />
      <Bar className="mb-5 h-3 w-3/4" />
      {rows.map(([first, second], i) => (
        <div key={i} className="mb-2 flex gap-3">
          <Bar className="h-4 w-16 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Bar className={`h-4 ${first}`} />
            {second && <Bar className={`h-4 ${second}`} />}
          </div>
        </div>
      ))}
      <Bar className="mt-3 h-4 w-1/3" />
      <Bar className="mt-6 h-10 w-full" />
    </div>
  );
}

/** Heading, cost chart and three option cards, in the same layout as the real plan. */
export function PlanSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Calculating travel options…</span>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${PULSE}`}>
        {/* On phones the venue/date heading wraps to two lines, with the distance line below. */}
        <div className="w-full space-y-2 sm:w-1/2">
          <Bar className="h-6 w-full" />
          <Bar className="h-6 w-1/2 sm:hidden" />
        </div>
        <Bar className="h-4 w-2/3 sm:w-1/4" />
      </div>
      <Card>
        <div className={PULSE}>
          {/* "Where the money goes (estimates)" wraps to two lines on phones. */}
          <div className="mb-4 space-y-2">
            <Bar className="h-5 w-2/3 sm:w-1/3" />
            <Bar className="h-5 w-1/3 sm:hidden" />
          </div>
          {["w-1/4", "w-2/3", "w-full"].map((w, i) => (
            <div key={i} className="mb-2 flex items-center gap-3">
              <Bar className="h-4 w-20 shrink-0" />
              <div className="h-5 flex-1">
                <Bar className={`h-5 ${w}`} />
              </div>
            </div>
          ))}
          <Bar className="mt-3 h-3 w-1/3" />
        </div>
      </Card>
      <div className="grid gap-4 pt-2 md:grid-cols-3">
        <OptionCardSkeleton />
        <OptionCardSkeleton />
        <OptionCardSkeleton />
      </div>
    </div>
  );
}

/** Shaped like the RecommendationPanel. Live Aivana takes 30-40 s here, so say why we're waiting. */
export function RecommendationSkeleton() {
  
  const seconds =
    useElapsedSeconds(true);

  return (
    <Card
      title="Recommendation"
      right={
        <span className="flex items-center gap-2 text-xs text-stone-500">
          <Spinner className="h-4 w-4" />
          Aivana is reviewing the options…
          {seconds >= 3 && ` ${seconds}s`}
        </span>
      }
    >
      <div role="status" aria-busy="true" className={PULSE}>
        <span className="sr-only">Aivana is reviewing the options. This can take up to 40 seconds.</span>
        <div className="mb-4 space-y-2">
          {/* Sized to a typical live answer: ~4 lines of reasoning on desktop, ~10 on phones. */}
          {["w-full", "w-full", "w-full", "w-2/3", ...Array<string>(5).fill("w-full sm:hidden"), "w-1/2 sm:hidden"].map((w, i) => (
            <Bar key={i} className={`h-4 ${w}`} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            // Live answers give 2-3 pros and 2-3 cons per option; they wrap more in the narrow 3-column layout.
            <div key={i} className="space-y-2 rounded-lg bg-stone-50 p-3">
              <Bar className="h-3 w-16" />
              {["w-5/6", "w-2/3", "w-3/4", "w-4/5", "w-2/3", "w-3/4"].map((w, j) => (
                <Bar key={j} className={`h-3 ${w}`} />
              ))}
              {["w-1/2", "w-2/3", "w-1/3"].map((w, j) => (
                <Bar key={`wrap${j}`} className={`hidden h-3 sm:block ${w}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Shaped like WhatIfChat. On phones it sits above the results, so without it they'd jump down when it appears. */
export function WhatIfChatSkeleton() {
  return (
    <Card title="What-if chat" right={<span className="text-xs text-stone-400">Aivana interprets · app recalculates</span>}>
      <div className={PULSE} aria-hidden="true">
        <div className="mb-4 space-y-1">
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-1/3" />
        </div>
        <div className="mb-2 flex flex-wrap gap-2">
          {["w-36", "w-44", "w-32", "w-36"].map((w, i) => (
            <Bar key={i} className={`h-[26px] rounded-full ${w}`} />
          ))}
        </div>
        <div className="flex gap-2">
          <Bar className="h-10 flex-1" />
          <Bar className="h-10 w-16" />
        </div>
      </div>
    </Card>
  );
}
