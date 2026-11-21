import { useEffect, useRef, useState } from "react";
import type { Planner } from "../hooks/usePlanner";
import {
  Button,
  Card,
  SourceBadge,
  Spinner,
  useElapsedSeconds,
} from "./ui";

const SUGGESTIONS = ["Leave 3 players home", "Cap hotel budget at $7000", "Use one fewer bus", "Upgrade hotel quality"];

export function WhatIfChat({ planner }: { planner: Planner }) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = planner.loading.whatif || planner.loading.plan;
  const whatIfSeconds = useElapsedSeconds(
  planner.loading.whatif
);

  // Braces matter: an effect may only return a cleanup function, and newer Chrome
  // returns a Promise from scrollIntoView, which React then fails to call ("destroy is not a function").
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [planner.chat.length]);

  const send = (msg: string) => {
    if (!msg.trim() || busy) return;
    setText("");
    void planner.sendWhatIf(msg.trim());
  };

  return (
    <Card title="What-if chat" right={<span className="text-xs text-stone-400">Aivana interprets · app recalculates</span>}>
      {planner.modifiers.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {planner.modifiers.map((m, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-xs text-ink ring-1 ring-brand/30">
              {m.explanation}
              <button onClick={() => planner.removeModifier(i)} disabled={busy} className="-my-1 -mr-2 px-2 py-1 text-base leading-none font-bold text-brand hover:text-brand-dark" aria-label="Undo">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mb-3 max-h-56 space-y-2 overflow-y-auto">
        {planner.chat.length === 0 && <p className="text-sm text-stone-400">Try a scenario. Every number is recalculated from the dataset.</p>}
        {planner.chat.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-ink text-white" : "bg-stone-100 text-stone-800"}`}>
              {m.text}
              {m.source && (
                <div className="mt-1">
                  <SourceBadge source={m.source} />
                </div>
              )}
            </div>
          </div>
        ))}
        {planner.loading.whatif && (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Spinner />
            Recalculating…
            {whatIfSeconds >= 3 &&
              ` ${whatIfSeconds}s`}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} disabled={busy} className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-600 hover:border-brand hover:text-brand disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. What if we bring 2 more staff?"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-base sm:text-sm focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none"
        />
        <Button type="submit" loading={planner.loading.whatif} disabled={!text.trim() || busy}>
          Send
        </Button>
      </form>
    </Card>
  );
}
