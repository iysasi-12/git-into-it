import type { LineItem, TravelOption } from "@app/shared";
import { money } from "../lib/format";
import { Card } from "./ui";

type Category = LineItem["category"];

const SEGMENTS: { category: Category; label: string; color: string }[] = [
  { category: "bus", label: "Bus", color: "bg-ink" },
  { category: "hotel", label: "Hotel", color: "bg-brand" },
  { category: "meals", label: "Meals", color: "bg-amber-300" },
];

// Add up the server's line items for one category (display only, no pricing logic).
function sumCategory(option: TravelOption, category: Category): number {
  return option.lineItems
    .filter((item) => item.category === category)
    .reduce((sum, item) => sum + item.total, 0);
}

export function CostChart({ options }: { options: TravelOption[] }) {
  // The most expensive option's bar is 100% wide; the others are scaled to it.
  const max = Math.max(...options.map((o) => o.totalCost));

  return (
    <Card title="Where the money goes (estimates)">
      {options.map((o) => (
        <div key={o.id} className="mb-2 flex items-center gap-3 text-sm">
          <span className="w-20 shrink-0 font-medium">Option {o.id}</span>
          <div className="flex h-5 min-w-0 flex-1 overflow-hidden rounded bg-stone-100">
            {SEGMENTS.map(({ category, label, color }) => {
              const amount = sumCategory(o, category);
              return (
                <div
                  key={category}
                  className={`${color} transition-[width] duration-500`}
                  style={{ width: max > 0 ? `${(amount / max) * 100}%` : "0%" }}
                  title={`${label}: ${money(amount)}`}
                />
              );
            })}
          </div>
          <span className="w-20 shrink-0 text-right">{money(o.totalCost)}</span>
        </div>
      ))}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-500">
        {SEGMENTS.map(({ category, label, color }) => (
          <span key={category} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${color}`} />
            {label}
          </span>
        ))}
      </div>
    </Card>
  );
}
