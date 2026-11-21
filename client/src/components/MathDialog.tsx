import { useCallback, useEffect, useRef, useState } from "react";
import type { CalcFactor, LineItem, TravelOption } from "@app/shared";
import { exact } from "../lib/format";

/** What the dialog explains: the option total or one line item. */
export type MathTarget = { kind: "total" } | { kind: "item"; index: number };

/** Underline style for any number that opens the math. */
export const showsMath = "cursor-pointer underline decoration-stone-300 decoration-dotted underline-offset-4 hover:decoration-brand";

/**
 * One math dialog per component: `showMath(option, target)` opens it, render `mathDialog` anywhere.
 */
export function useMathDialog() {
  const [state, setState] = useState<{ option: TravelOption; target: MathTarget } | null>(null);
  const showMath = useCallback(
    (option: TravelOption, target: MathTarget = { kind: "total" }) => setState({ option, target }),
    [],
  );
  const close = useCallback(() => setState(null), []);
  const mathDialog = state && (
    <MathDialog
      option={state.option}
      target={state.target}
      onTarget={(target) => setState({ option: state.option, target })}
      onClose={close}
    />
  );
  return { showMath, mathDialog };
}

// Display only: every number and sentence here comes from the server's line items.
function factorText(f: CalcFactor) {
  return f.money ? `${exact(f.value)}/${f.unit}` : `${f.value.toLocaleString()} ${f.unit}`;
}

function Equation({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-stone-50 px-3 py-2 font-mono text-sm text-ink">{children}</p>;
}

function ItemMath({ item }: { item: LineItem }) {
  const { factors, rules } = item.basis;
  return (
    <>
      <Equation>
        {factors.map(factorText).join(" × ")} = <strong>{exact(item.total)}</strong>
      </Equation>

      <h4 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">Where each number comes from</h4>
      <dl className="space-y-1.5 text-sm">
        {factors.map((f, i) => (
          <div key={i}>
            <dt className="font-medium text-ink">{factorText(f)}</dt>
            <dd className="text-stone-600">{f.source}</dd>
          </div>
        ))}
      </dl>

      {rules.length > 0 && (
        <>
          <h4 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">Rules applied</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
            {rules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function TotalMath({ option: o, onPick }: { option: TravelOption; onPick: (index: number) => void }) {
  return (
    <>
      <ul className="divide-y divide-stone-100 text-sm">
        {o.lineItems.map((li, i) => (
          <li key={i}>
            <button onClick={() => onPick(i)} className="flex w-full items-baseline justify-between gap-3 py-1.5 text-left hover:text-brand">
              <span>{li.label}</span>
              <span className="font-medium whitespace-nowrap">{exact(li.total)}</span>
            </button>
          </li>
        ))}
        <li className="flex justify-between border-t-2 border-stone-200 py-1.5 font-bold">
          <span>Total (estimate)</span>
          <span>{exact(o.totalCost)}</span>
        </li>
      </ul>
      <p className="mt-1 text-xs text-stone-500">Click a line to see how it was calculated.</p>
      <h4 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">Per traveler</h4>
      <Equation>
        {exact(o.totalCost)} ÷ {o.travelers.total} travelers = <strong>{exact(o.costPerTraveler)}</strong>
      </Equation>
    </>
  );
}

export function MathDialog({
  option,
  target,
  onTarget,
  onClose,
}: {
  option: TravelOption;
  target: MathTarget;
  onTarget: (t: MathTarget) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [onClose]);

  const item = target.kind === "item" ? option.lineItems[target.index] : undefined;
  const title = item ? item.label : `How Option ${option.id}'s ${exact(option.totalCost)} adds up`;

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // A click on the backdrop lands on the <dialog> itself; clicks inside land on the panel.
      // Stop propagation so a parent with its own click-to-close (the memo overlay) stays open.
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === ref.current) ref.current.close();
      }}
      className="no-print m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-white text-stone-800 shadow-xl backdrop:bg-black/40"
    >
      <div className="max-h-[85vh] overflow-y-auto p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {item && (
              <button onClick={() => onTarget({ kind: "total" })} className="mb-1 text-xs font-medium text-brand hover:underline">
                ← All of Option {option.id}
              </button>
            )}
            <h3 className="font-bold text-ink">{title}</h3>
          </div>
          <button onClick={() => ref.current?.close()} className="text-xl leading-none text-stone-400 hover:text-stone-700" aria-label="Close">
            ×
          </button>
        </div>

        {item ? <ItemMath item={item} /> : <TotalMath option={option} onPick={(index) => onTarget({ kind: "item", index })} />}

        <p className="mt-5 border-t border-stone-100 pt-3 text-xs text-stone-500">
          Estimate calculated by the app from the travel dataset. Aivana never produces these numbers.
        </p>
      </div>
    </dialog>
  );
}
