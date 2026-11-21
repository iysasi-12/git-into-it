import { useState } from "react";
import type { DepartureDay, TripRequest } from "@app/shared";
import type { Planner } from "../hooks/usePlanner";
import { DEPARTURE_LABELS } from "../lib/format";
import {
  Button,
  Card,
  useElapsedSeconds,
} from "./ui";

const SAMPLE =
  "Plan travel for our game at Ohio State on Saturday, October 9, 2027. 65 players, 8 coaches, 4 staff. Leave Friday after classes. We need a vegetarian option at team meals.";

const input = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-stone-600";

export function RequestPanel({ planner }: { planner: Planner }) {
  const [tab, setTab] = useState<"form" | "text">("form");
  return (
    <Card>
      <div className="mb-4 flex rounded-lg bg-stone-100 p-1 text-sm">
        {(["form", "text"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-1.5 font-medium ${tab === t ? "bg-white text-ink shadow-sm" : "text-stone-500"}`}
          >
            {t === "form" ? "Trip details" : "✦ Describe it"}
          </button>
        ))}
      </div>
      {tab === "text" ? <FreeTextInput planner={planner} onDone={() => setTab("form")} /> : <RequestForm planner={planner} />}
    </Card>
  );
}

function FreeTextInput({
  planner,
  onDone,
}: {
  planner: Planner;
  onDone: () => void;
}) {
  const [text, setText] = useState("");

  const parseSeconds =
    useElapsedSeconds(
      planner.loading.parse
    );

  const submit = async () => {
    if (await planner.parseText(text)) onDone();
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">Describe the trip in plain English. Aivana extracts the details into the form for you to confirm.</p>
      <textarea className={`${input} h-36`} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE} />
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={submit}
          loading={planner.loading.parse}
          disabled={text.trim().length < 5}
        >
          {planner.loading.parse
            ? `Extracting${
                parseSeconds >= 3
                  ? ` ${parseSeconds}s`
                  : ""
              }`
            : "Extract details"}
        </Button>
        <Button variant="secondary" onClick={() => setText(SAMPLE)}>
          Use sample
        </Button>
      </div>
    </div>
  );
}

function RequestForm({ planner }: { planner: Planner }) {
  const { draft, setDraft, opponents, missingFields } = planner;
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof TripRequest>(k: K, v: TripRequest[K] | undefined) => setDraft((d) => ({ ...d, [k]: v }));
  const num = (v: string) => (v === "" ? undefined : Math.max(0, Math.trunc(Number(v))));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const d = draft;
    if (!d.opponentId || !d.gameDate || !d.players || d.coaches == null || d.staff == null || !d.departure) {
      setFormError("Please fill in opponent, game date, and traveler counts.");
      return;
    }
    setFormError(null);
    void planner.generatePlan({
      opponentId: d.opponentId,
      gameDate: d.gameDate,
      gameTime: d.gameTime || undefined,
      players: d.players,
      coaches: d.coaches,
      staff: d.staff,
      departure: d.departure,
      earliestDepartureTime: d.earliestDepartureTime || undefined,
      specialRequests: d.specialRequests ?? [],
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {missingFields.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Aivana couldn't find: {missingFields.join(", ")}. Please complete below.
        </p>
      )}
      <div>
        <label className={labelCls}>Opponent (away game at)</label>
        <select className={input} value={draft.opponentId ?? ""} onChange={(e) => set("opponentId", e.target.value || undefined)}>
          <option value="">Select opponent…</option>
          {opponents.map((o) => (
            <option key={o.id} value={o.id}>
              {o.school} — {o.city}, {o.state} ({o.distanceMiles} mi)
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Game date</label>
          <input type="date" className={input} value={draft.gameDate ?? ""} onChange={(e) => set("gameDate", e.target.value || undefined)} />
        </div>
        <div>
          <label className={labelCls}>Kickoff</label>
          <input type="time" className={input} value={draft.gameTime ?? ""} onChange={(e) => set("gameTime", e.target.value || undefined)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {(["players", "coaches", "staff"] as const).map((k) => (
          <div key={k}>
            <label className={`${labelCls} capitalize`}>{k}</label>
            <input type="number" min={0} className={input} value={draft[k] ?? ""} onChange={(e) => set(k, num(e.target.value))} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Departure</label>
          <select className={input} value={draft.departure ?? "day_before"} onChange={(e) => set("departure", e.target.value as DepartureDay)}>
            {Object.entries(DEPARTURE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Earliest departure time</label>
          <input
            type="time"
            className={input}
            value={draft.earliestDepartureTime ?? ""}
            onChange={(e) => set("earliestDepartureTime", e.target.value || undefined)}
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>Special requests (one per line)</label>
        <textarea
          className={`${input} h-16`}
          value={(draft.specialRequests ?? []).join("\n")}
          onChange={(e) => set("specialRequests", e.target.value.split("\n").filter((s) => s.trim()))}
        />
      </div>
      {formError && <p className="text-xs text-red-600">{formError}</p>}
      <Button type="submit" className="w-full" loading={planner.loading.plan}>
        Build travel options
      </Button>
    </form>
  );
}
