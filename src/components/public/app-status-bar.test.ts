import { describe, expect, it } from "vitest";
import { statusPollDelay } from "@/lib/public-status";

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
