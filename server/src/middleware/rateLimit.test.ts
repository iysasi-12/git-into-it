import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { AppError } from "../errors.js";
import { rateLimit } from "./rateLimit.js";

function harness(limit: number, windowMs: number) {
  let clock = 0;
  const mw = rateLimit({ limit, windowMs, now: () => clock });
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => (headers[k] = v) } as unknown as Response;
  const call = (ip: string) => {
    let result: unknown = "not called";
    mw({ ip } as Request, res, (err?: unknown) => (result = err));
    return result; // undefined = allowed, AppError = blocked
  };
  return { call, headers, advance: (ms: number) => (clock += ms) };
}

describe("rateLimit", () => {
  it("allows up to the limit, then answers 429 with Retry-After", () => {
    const h = harness(3, 60_000);
    expect([h.call("a"), h.call("a"), h.call("a")]).toEqual([undefined, undefined, undefined]);
    h.advance(15_000);
    const blocked = h.call("a");
    expect(blocked).toBeInstanceOf(AppError);
    expect((blocked as AppError).status).toBe(429);
    expect(h.headers["Retry-After"]).toBe("45"); // 60 s window started at 0, now at 15 s
  });

  it("counts each IP separately", () => {
    const h = harness(1, 60_000);
    expect(h.call("a")).toBeUndefined();
    expect(h.call("b")).toBeUndefined();
    expect(h.call("a")).toBeInstanceOf(AppError);
  });

  it("resets when the window ends", () => {
    const h = harness(1, 60_000);
    h.call("a");
    expect(h.call("a")).toBeInstanceOf(AppError);
    h.advance(60_000);
    expect(h.call("a")).toBeUndefined();
  });
});
