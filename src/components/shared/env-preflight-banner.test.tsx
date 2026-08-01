import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const preflightMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => preflightMock,
}));

vi.mock("@/lib/env-preflight.functions", () => ({
  getSupabaseEnvPreflight: vi.fn(),
}));

import {
  announceCountdown,
  buildHistoryCsv,
  EnvPreflightBanner,
} from "./env-preflight-banner";

const MISSING_RESPONSE = {
  ok: false,
  missing: [{ name: "SUPABASE_SERVICE_ROLE_KEY", purpose: "Privileged operations" }],
  variables: [],
};

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EnvPreflightBanner />
    </QueryClientProvider>,
  );
}

describe("announceCountdown", () => {
  it("spells out minutes and seconds for screen readers", () => {
    expect(announceCountdown(125_000)).toBe("2 minutes 5 seconds");
    expect(announceCountdown(60_000)).toBe("1 minute");
    expect(announceCountdown(1_000)).toBe("1 second");
    expect(announceCountdown(0)).toBe("0 seconds");
    expect(announceCountdown(-5_000)).toBe("0 seconds");
  });
});

describe("buildHistoryCsv", () => {
  it("emits a header row and one row per check", () => {
    const csv = buildHistoryCsv([
      { at: Date.parse("2026-01-01T00:00:00Z"), ok: false, missing: ["A", "B"] },
      { at: Date.parse("2026-01-01T00:01:00Z"), ok: true, missing: [] },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("checked_at,status,missing_variables");
    expect(lines[1]).toBe('"2026-01-01T00:00:00.000Z","missing","A B"');
    expect(lines[2]).toBe('"2026-01-01T00:01:00.000Z","ok",""');
  });
});

describe("EnvPreflightBanner accessibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
    preflightMock.mockReset();
    preflightMock.mockResolvedValue(MISSING_RESPONSE);
  });

  it("announces the missing variables and countdown in an aria-live status region", async () => {
    renderBanner();
    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    await waitFor(() =>
      expect(status.textContent).toContain("1 environment variable still missing"),
    );
    expect(status.textContent).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(status.textContent).toMatch(/Next automatic check in .*minutes?/);
  });

  it("hides the visual countdown from screen readers to avoid duplicate announcements", async () => {
    renderBanner();
    await screen.findByRole("status");
    const visual = await screen.findByText(/Next check in/);
    expect(visual).toHaveAttribute("aria-hidden", "true");
  });

  it("shows success messaging after running a manual check", async () => {
    renderBanner();
    const user = userEvent.setup();
    await screen.findByRole("status");
    await user.click(screen.getByRole("button", { name: /run preflight check now/i }));
    await waitFor(() =>
      expect(screen.getByTestId("run-status").textContent).toContain("Check complete"),
    );
  });

  it("reports an error state when the check fails", async () => {
    renderBanner();
    const user = userEvent.setup();
    await screen.findByRole("status");
    preflightMock.mockRejectedValueOnce(new Error("network down"));
    await user.click(screen.getByRole("button", { name: /run preflight check now/i }));
    await waitFor(() =>
      expect(screen.getByTestId("run-status").textContent).toContain("Check failed"),
    );
    expect((await screen.findByRole("status")).textContent).toContain("network down");
  });

  it("clears the recent check history for the current project", async () => {
    renderBanner();
    const user = userEvent.setup();
    await screen.findByText("Recent checks");
    await user.click(screen.getByRole("button", { name: /clear history/i }));
    await waitFor(() => expect(screen.queryByText("Recent checks")).not.toBeInTheDocument());
  });
});
