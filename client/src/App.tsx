import { CostChart } from "./components/CostChart";
import { MemoView } from "./components/MemoView";
import { OptionCard } from "./components/OptionCard";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { RequestPanel } from "./components/RequestPanel";
import { PlanSkeleton, RecommendationSkeleton, WhatIfChatSkeleton } from "./components/Skeletons";
import { Card, ErrorBanner } from "./components/ui";
import { WhatIfChat } from "./components/WhatIfChat";
import { usePlanner } from "./hooks/usePlanner";
import { prettyDate } from "./lib/format";

export default function App() {
  const planner = usePlanner();
  const { plan, previousPlan, recommendation, memo, loading } = planner;
  const cheapest = plan ? Math.min(...plan.options.map((o) => o.totalCost)) : 0;

  return (
    <div className="min-h-screen">
      <header className="no-print bg-ink text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold">
              <span className="text-brand">▲</span> Away-Game Travel Planner
            </h1>
            <p className="text-xs text-stone-300">Compare travel packages · AI recommendations by Aivana · costs calculated from dataset</p>
          </div>
        </div>
      </header>

      <main className="no-print mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <RequestPanel planner={planner} />
          {plan ? <WhatIfChat planner={planner} /> : loading.plan && <WhatIfChatSkeleton />}
        </aside>

        <section className="space-y-4">
          {planner.error && <ErrorBanner message={planner.error} onClose={planner.clearError} />}

          {!plan && !loading.plan && (
            <Card>
              <div className="py-16 text-center text-stone-500">
                <p className="mb-2 text-4xl">🚌</p>
                <p className="font-medium">Enter trip details or describe the trip to compare three travel packages.</p>
                <p className="text-sm">Lowest Cost · Balanced · Comfort</p>
              </div>
            </Card>
          )}

          {loading.plan && !plan && <PlanSkeleton />}

          {plan && (
            <div className={`space-y-4 transition-opacity ${loading.plan || loading.whatif ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold text-ink">
                  @ {plan.venue.school} · {prettyDate(plan.request.gameDate)}
                </h2>
                <p className="text-sm text-stone-500">
                  {plan.venue.distanceMiles} mi / {plan.venue.driveHours} h each way · {plan.options[0].travelers.total} travelers
                </p>
              </div>

              <CostChart options={plan.options} />

              <div className="grid gap-4 pt-2 md:grid-cols-3">
                {plan.options.map((o) => (
                  <OptionCard
                    key={o.id}
                    option={o}
                    previousOption={previousPlan?.options.find((p) => p.id === o.id)}
                    cheapest={cheapest}
                    recommended={recommendation?.recommendedOptionId === o.id}
                    onMemo={() => planner.generateMemo(o.id)}
                    memoLoading={loading.memo}
                  />
                ))}
              </div>

              {recommendation ? <RecommendationPanel rec={recommendation} /> : loading.recommend && <RecommendationSkeleton />}
              <p className="text-center text-xs text-stone-400">{plan.disclaimer}</p>
            </div>
          )}
        </section>
      </main>

      {memo && <MemoView data={memo} onClose={planner.closeMemo} />}
    </div>
  );
}
