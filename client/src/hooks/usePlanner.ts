import { useCallback, useEffect, useState } from "react";
import type {
  AiSource,
  MemoResponse,
  OpponentSummary,
  OptionId,
  PlanResult,
  Recommendation,
  TripRequest,
  WhatIfCommand,
} from "@app/shared";
import { api } from "../api/client";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  source?: AiSource;
}

type LoadingKey = "parse" | "plan" | "whatif" | "memo";

export const EMPTY_DRAFT: Partial<TripRequest> = {
  players: undefined,
  coaches: undefined,
  staff: undefined,
  departure: "day_before",
  earliestDepartureTime: "14:00",
  gameTime: "15:30",
  specialRequests: [],
};

/** All app state + actions. The server is stateless; we hold request + modifiers. */
export function usePlanner() {
  const [opponents, setOpponents] = useState<OpponentSummary[]>([]);
  const [draft, setDraft] = useState<Partial<TripRequest>>(EMPTY_DRAFT);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [baseRequest, setBaseRequest] = useState<TripRequest | null>(null);
  const [modifiers, setModifiers] = useState<WhatIfCommand[]>([]);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [previousPlan, setPreviousPlan] =
  useState<PlanResult | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [memo, setMemo] = useState<MemoResponse | null>(null);
  const [loading, setLoading] = useState<Record<LoadingKey, boolean>>({ parse: false, plan: false, whatif: false, memo: false });
  const [error, setError] = useState<string | null>(null);
  
  const run = useCallback(async <T,>(key: LoadingKey, fn: () => Promise<T>): Promise<T | undefined> => {
    setLoading((l) => ({ ...l, [key]: true }));
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setLoading((l) => ({ ...l, [key]: false }));
    }
  }, []);

  useEffect(() => {
    api.opponents().then(setOpponents).catch((e: Error) => setError(e.message));
  }, []);

  const parseText = (text: string) =>
    run("parse", async () => {
      const r = await api.parse(text);
      setDraft((d) => ({ ...d, ...r.request }));
      setMissingFields([...r.missingFields, ...(r.unmatchedOpponent ? [`opponent "${r.unmatchedOpponent}" not in dataset`] : [])]);
      return r;
    });

  const replan = (request: TripRequest, mods: WhatIfCommand[]) =>
    run("plan", async () => {
      const r = await api.plan({ request, modifiers: mods });
      setPlan(r.plan);
      setRecommendation(r.recommendation);
      setModifiers(mods);
      return r;
    });

  const generatePlan = async (request: TripRequest) => {
  setBaseRequest(request);

  setPreviousPlan(null);

  setChat([]);
  setMemo(null);

  await replan(request, []);
};

  const sendWhatIf = (message: string) =>
    baseRequest &&
    run("whatif", async () => {
      setChat((c) => [...c, { role: "user", text: message }]);
      try {
        const r = await api.whatIf({
          request: baseRequest,
          modifiers,
          message
        });

        setPreviousPlan(plan);

        setPlan(r.plan);
        setRecommendation(r.recommendation);
        setModifiers(r.modifiers);
        setChat((c) => [...c, { role: "assistant", text: r.note, source: r.source }]);
        return r;
      } catch (e) {
        setChat((c) => [...c, { role: "assistant", text: `Sorry — ${(e as Error).message}` }]);
        throw e;
      }
    });

    const removeModifier = (index: number) => {
      if (!baseRequest) return;

  setPreviousPlan(plan);

  void replan(
    baseRequest,
    modifiers.filter((_, i) => i !== index)
  );
};

  const generateMemo = (optionId: OptionId) =>
    baseRequest && run("memo", async () => {
      const r = await api.memo({ request: baseRequest, modifiers, optionId });
      setMemo(r);
      return r;
    });
    

  return {
    opponents,
    draft,
    setDraft,
    missingFields,
    plan,
    previousPlan,
    recommendation,
    modifiers,
    chat,
    memo,
    closeMemo: () => setMemo(null),
    loading,
    error,
    clearError: () => setError(null),
    parseText,
    generatePlan,
    sendWhatIf,
    removeModifier,
    generateMemo,
  };
  
}

export type Planner = ReturnType<typeof usePlanner>;
