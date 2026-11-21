import type {
  ApiError,
  MemoRequestBody,
  MemoResponse,
  OpponentSummary,
  ParseResponse,
  PlanRequestBody,
  PlanResponse,
  RecommendRequestBody,
  RecommendResponse,
  WhatIfRequestBody,
  WhatIfResponse,
} from "@app/shared";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Cannot reach the server. Is the API running?");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    throw new Error(err?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  opponents: () => request<OpponentSummary[]>("/opponents"),
  parse: (text: string) => post<ParseResponse>("/parse", { text }),
  plan: (body: PlanRequestBody) => post<PlanResponse>("/plan", body),
  recommend: (body: RecommendRequestBody) => post<RecommendResponse>("/recommend", body),
  whatIf: (body: WhatIfRequestBody) => post<WhatIfResponse>("/whatif", body),
  memo: (body: MemoRequestBody) => post<MemoResponse>("/memo", body),
};
