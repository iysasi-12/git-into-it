import { useState } from "react";
import type { MemoResponse } from "@app/shared";
import { money, money2 } from "../lib/format";
import { Button, SourceBadge } from "./ui";

export function MemoView({ data, onClose }: { data: MemoResponse; onClose: () => void }) {
  const { memo, option, plan } = data;
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    const text = `
  ${memo.title}

  ${memo.summary}

  ITINERARY
  ${memo.itinerary
    .map((e) => `${e.day} ${e.time} - ${e.activity}`)
    .join("\n")}

  DEPARTURE REMINDERS
  ${memo.departureReminders.join("\n")}
  `;

    await navigator.clipboard.writeText(text);

    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  } 
  return (
    <div className="print-only-area fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <article className="mx-auto max-w-3xl rounded-xl bg-white p-4 shadow-xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="no-print mb-4 flex items-center justify-between">
          <SourceBadge source={memo.source} />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <h1 className="mb-1 text-2xl font-bold text-ink">{memo.title}</h1>
        <p className="mb-4 text-sm text-stone-500">
          Option {option.id} ({option.label}) · {plan.venue.stadium}, {plan.venue.city}, {plan.venue.state}
        </p>
        <p className="mb-6 leading-relaxed">{memo.summary}</p>

        <Section title="Itinerary">
          <table className="w-full text-sm">
            <tbody>
              {memo.itinerary.map((e, i) => (
                <tr key={i} className="border-t border-stone-100">
                  {/* Day may wrap on phones so the activity column keeps its width. */}
                  <td className="py-1.5 pr-3 align-top text-xs text-stone-500 sm:text-sm sm:whitespace-nowrap">{e.day}</td>
                  <td className="py-1.5 pr-3 align-top font-mono whitespace-nowrap">{e.time}</td>
                  <td className="py-1.5 align-top">{e.activity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Departure reminders">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {memo.departureReminders.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>

        <Section title="Meal schedule">
          <ul className="space-y-1 text-sm">
            {memo.mealSchedule.map((m, i) => (
              <li key={i}>
                <span className="text-stone-500">{m.day}</span> · <span className="font-medium capitalize">{m.meal}</span> — {m.note}
              </li>
            ))}
          </ul>
        </Section>

        {/* Costs come straight from the calculation engine, never from AI text. */}
        <Section title="Estimated costs (calculated)">
          <table className="w-full text-sm">
            <tbody>
              {option.lineItems.map((li, i) => (
                <tr key={i} className="border-t border-stone-100">
                  <td className="py-1 pr-2">
                    {li.label}
                    <span className="text-stone-400">
                      {" "}
                      · {li.quantity.toLocaleString()} {li.unit} × {money2(li.unitCost)}
                    </span>
                  </td>
                  <td className="py-1 text-right whitespace-nowrap">{money(li.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-stone-300 font-bold">
                <td className="py-1">Total estimate</td>
                <td className="py-1 text-right">{money(option.totalCost)}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        {memo.guardNotes.length > 0 && <p className="mb-2 text-xs text-stone-400">🛡 {memo.guardNotes.length} unverified figure(s) removed from AI text.</p>}
        <p className="text-xs text-stone-400 italic">{plan.disclaimer}</p>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 border-b border-brand/40 pb-1 text-sm font-semibold tracking-wide text-ink uppercase">{title}</h2>
      {children}
    </section>
  );
}
