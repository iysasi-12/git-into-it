import { afterEach, describe, expect, it, vi } from "vitest";
import { AivanaError, concurrencyRetryDelayMs, generate } from "./aivanaClient.js";

// The 429 body Aivana sent on 2026-11-21 when a fifth request ran at once.
const concurrency429 = (retryAfterMs: number) =>
  JSON.stringify({
    error: {
      type: "rate_limit_exceeded",
      code: "rate_limit_exceeded",
      message: "Too many requests are running at once for this account. Retry when one finishes.",
      bucket: "concurrency",
      retry_after_ms: retryAfterMs,
    },
  });

describe("concurrencyRetryDelayMs", () => {
  it("uses retry_after_ms from a concurrency 429", () => {
    expect(concurrencyRetryDelayMs(429, concurrency429(5000))).toBe(5000);
  });
  it("caps a long retry_after_ms at 10 s", () => {
    expect(concurrencyRetryDelayMs(429, concurrency429(60_000))).toBe(10_000);
  });
  it("ignores other 429 buckets, other statuses and non-JSON bodies", () => {
    expect(concurrencyRetryDelayMs(429, JSON.stringify({ error: { bucket: "requests_per_minute", retry_after_ms: 100 } }))).toBeNull();
    expect(concurrencyRetryDelayMs(500, concurrency429(5000))).toBeNull();
    expect(concurrencyRetryDelayMs(429, "Too Many Requests")).toBeNull();
  });
});

describe("generate retries a concurrency 429 once", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the answer from the retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(concurrency429(10), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ answer: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generate("hi", { timeoutMs: 30_000 })).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(concurrency429(10), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generate("hi", { timeoutMs: 30_000 })).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry when the wait would leave too little of the timeout", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(concurrency429(5000), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generate("hi", { timeoutMs: 8000 })).rejects.toBeInstanceOf(AivanaError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
