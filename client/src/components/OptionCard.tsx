import { useCallback, useState } from "react";
import type { TravelOption } from "@app/shared";
import { DEPARTURE_LABELS, money, money2, prettyDate, prettyTime } from "../lib/format";
import { MathDialog, type MathTarget } from "./MathDialog";
import { Button, useElapsedSeconds, } from "./ui";

const showsMath = "cursor-pointer underline decoration-stone-300 decoration-dotted underline-offset-4 hover:decoration-brand";

interface Props {
  option: TravelOption;
  previousOption?: TravelOption;
  recommended: boolean;
  cheapest: number;
  onMemo: () => void;
  memoLoading: boolean;
}

export function OptionCard({
  option: o,
  previousOption,
  recommended,
  cheapest,
  onMemo,
  memoLoading,
}: Props) {
  const [open, setOpen] = useState(false);
  const [math, setMath] = useState<MathTarget | null>(null);
  const closeMath = useCallback(() => setMath(null), []);
  const memoSeconds = useElapsedSeconds(memoLoading);
  const delta = o.totalCost - cheapest;
  const costChange = previousOption ? o.totalCost - previousOption.totalCost : 0;


  return (
    <article
      className={`relative flex flex-col rounded-xl border bg-white p-4 shadow-sm transition ${
        recommended ? "border-brand ring-2 ring-brand/30" : "border-stone-200"
      }`}
    >
      {recommended && (
        <span className="absolute -top-3 left-4 rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-white shadow">★ Recommended</span>
      )}
      <header className="mb-2">
        <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Option {o.id}</p>
        <h3 className="text-lg font-bold text-ink">{o.label}</h3>
      </header>

      <div className="mb-3">
        <div className="flex items-center gap-2">
  <button
    onClick={() => setMath({ kind: "total" })}
    className={`text-3xl font-extrabold text-ink ${showsMath}`}
    title="Show the math"
  >
    {money(o.totalCost)}
  </button>

  {costChange < 0 && (
    <span className="text-sm font-semibold text-green-600">
      ▼ {money(Math.abs(costChange))}
    </span>
  )}

  {costChange > 0 && (
    <span className="text-sm font-semibold text-red-600">
      ▲ {money(costChange)}
    </span>
  )}
</div>
        <p className="text-xs text-stone-500">
          Estimate ·{" "}
          <button onClick={() => setMath({ kind: "total" })} className={showsMath} title="Show the math">
            {money(o.costPerTraveler)} per traveler
          </button>
          {delta > 0 && <span className="text-stone-400"> · +{money(delta)} vs lowest</span>}
        </p>
      </div>

      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-stone-500">Depart</dt>
        <dd>
          {prettyDate(o.departure.date)} {prettyTime(o.departure.time)} <span className="text-stone-400">({DEPARTURE_LABELS[o.departure.day]})</span>
        </dd>
        <dt className="text-stone-500">Travelers</dt>
        <dd>{o.travelers.total}</dd>
        <dt className="text-stone-500">Buses</dt>
        <dd>
          {o.buses.count} × {o.buses.busTypeName} <span className="text-stone-400">({o.buses.totalSeats} seats)</span>
        </dd>
        <dt className="text-stone-500">Hotel</dt>
        <dd>
          {o.hotel ? (
            <>
              {o.hotel.name} <span className="text-stone-400 capitalize">({o.hotel.tier}, {o.hotel.distanceToStadiumMiles} mi to stadium)</span>
            </>
          ) : (
            <span className="text-stone-400">None (same-day trip)</span>
          )}
        </dd>
        {o.nights > 0 && (
          <>
            <dt className="text-stone-500">Rooms</dt>
            <dd>
              {o.rooms.total} × {o.nights} night{o.nights > 1 ? "s" : ""}
            </dd>
          </>
        )}
        <dt className="text-stone-500">Meals</dt>
        <dd>{o.meals.length} team meals</dd>
      </dl>

      {o.warnings.length > 0 && (
        <ul className="mb-3 space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          {o.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}

      <button onClick={() => setOpen(!open)} className="mb-3 self-start text-xs font-medium text-brand hover:underline">
        {open ? "Hide" : "Show"} cost breakdown
      </button>
      {open && (
    <table className="mb-3 w-full text-xs">
          <tbody>
            {o.lineItems.map((li, i) => (
              <tr
                key={i}
                onClick={() => setMath({ kind: "item", index: i })}
                className="cursor-pointer border-t border-stone-100 hover:bg-stone-50"
              >
                <td className="py-1 pr-2">
                  <button className="text-left hover:text-brand" title="Show the math">
                    {li.label}
                  </button>
                  <div className="text-stone-400">
                    {li.quantity.toLocaleString()} {li.unit} × {money2(li.unitCost)}
                  </div>
                </td>
                <td className="py-1 text-right font-medium whitespace-nowrap">{money(li.total)}</td>
              </tr>
            ))}
            <tr onClick={() => setMath({ kind: "total" })} className="cursor-pointer border-t-2 border-stone-200 font-bold hover:bg-stone-50">
              <td className="py-1">Total (estimate)</td>
              <td className="py-1 text-right">{money(o.totalCost)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {math && <MathDialog option={o} target={math} onTarget={setMath} onClose={closeMath} />}

      <Button
  variant={recommended ? "primary" : "secondary"}
  className="mt-auto"
  onClick={onMemo}
  loading={memoLoading}
>
  {memoLoading
    ? `Generating memo${memoSeconds >= 3 ? ` ${memoSeconds}s` : ""}`
    : "Generate travel memo"}
</Button>
    </article>
  );
}
