import type { Recommendation } from "@app/shared";
import { Card, SourceBadge } from "./ui";

export function RecommendationPanel({ rec }: { rec: Recommendation }) {
  return (
    <Card title={<>Recommendation: Option {rec.recommendedOptionId}</>} right={<SourceBadge source={rec.source} />}>
      <p className="mb-4 text-sm leading-relaxed text-stone-700">{rec.reasoning}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {rec.tradeoffs.map((t) => (
          <div key={t.optionId} className="rounded-lg bg-stone-50 p-3 text-xs">
            <p className="mb-1 font-semibold text-ink">Option {t.optionId}</p>
            <ul className="space-y-0.5">
              {t.pros.map((p, i) => (
                <li key={`p${i}`} className="text-emerald-700">
                  + {p}
                </li>
              ))}
              {t.cons.map((c, i) => (
                <li key={`c${i}`} className="text-rose-700">
                  − {c}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {rec.guardNotes.length > 0 && (
        <details className="mt-3 text-xs text-stone-500">
          <summary className="cursor-pointer">🛡 Guardrail removed {rec.guardNotes.length} unverified figure(s)</summary>
          <ul className="mt-1 list-disc pl-5">
            {rec.guardNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
