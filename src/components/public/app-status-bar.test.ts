import { describe, expect, it } from "vitest";
import {
  MAX_THROTTLE_BACKOFF_SECONDS,
  classifyHealthResponse,
  statusPollDelay,
  throttleRetryDelay,
} from "@/lib/public-status";

describe("AppStatusBar polling", () => {
  it("polls healthy service every 30 seconds", () => {
    expect(statusPollDelay(0, () => 0.5)).toBe(30_000);
  });

  it("backs off degraded polling from 10 to at most 60 seconds with jitter", () => {
    expect(statusPollDelay(1, () => 0.5)).toBe(10_000);
    expect(statusPollDelay(2, () => 0.5)).toBe(20_000);
    expect(statusPollDelay(3, () => 0.5)).toBe(40_000);
    expect(statusPollDelay(8, () => 1)).toBe(60_000);
    expect(statusPollDelay(1, () => 0)).toBe(8_000);
  });
});

describe("health response classification", () => {
  it("treats a healthy reply as ok", () => {
    expect(classifyHealthResponse(200, { status: "ok" })).toEqual({ kind: "ok" });
  });

  // Regression: a 429 from the public rate limiter used to collapse to null and
  // raise the global "trouble reaching our service" outage banner.
  it("treats rate limiting as throttled, never as an outage", () => {
    expect(
      classifyHealthResponse(429, { status: "throttled", retryAfterSeconds: 14 }, "14"),
    ).toEqual({ kind: "throttled", retryAfterSeconds: 14 });
    expect(classifyHealthResponse(429, { ok: false, code: "RATE_LIMITED" }, null)).toEqual({
      kind: "throttled",
      retryAfterSeconds: 30,
    });
  });

  it("bounds an absurd retry hint", () => {
    const probe = classifyHealthResponse(429, null, "999999");
    expect(probe).toEqual({ kind: "throttled", retryAfterSeconds: MAX_THROTTLE_BACKOFF_SECONDS });
  });

  it("still reports a genuine backend failure as degraded", () => {
    expect(classifyHealthResponse(503, { status: "degraded" })).toEqual({ kind: "degraded" });
    expect(classifyHealthResponse(500, null)).toEqual({ kind: "degraded" });
  });

  it("reports an unusable reply as unreachable rather than healthy", () => {
    expect(classifyHealthResponse(404, null)).toEqual({ kind: "unreachable" });
    expect(classifyHealthResponse(200, { status: "something-else" })).toEqual({
      kind: "unreachable",
    });
    expect(classifyHealthResponse(200, null)).toEqual({ kind: "unreachable" });
  });

  it("waits at least the requested throttle window before probing again", () => {
    expect(throttleRetryDelay(14)).toBe(14_000);
    expect(throttleRetryDelay(0)).toBe(1_000);
    expect(throttleRetryDelay(10_000)).toBe(MAX_THROTTLE_BACKOFF_SECONDS * 1000);
  });
});
