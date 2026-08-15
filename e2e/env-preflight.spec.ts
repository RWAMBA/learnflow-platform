import { expect, test, type Page } from "@playwright/test";

/**
 * Deterministic, non-secret fixture. Only variable *names*, purposes and
 * presence flags are ever transported — never a value — which mirrors the
 * production `/api/env-preflight` contract and keeps the harness independent
 * of whatever the developer happens to have in their local environment.
 */
const MISSING_PAYLOAD = {
  ok: false,
  missing: [
    { name: "SUPABASE_SERVICE_ROLE_KEY", purpose: "Privileged operations" },
    { name: "SUPABASE_URL", purpose: "Server-side Supabase API endpoint" },
  ],
  variables: [
    { name: "SUPABASE_URL", present: false, scope: "core" },
    { name: "SUPABASE_PUBLISHABLE_KEY", present: true, scope: "core" },
    { name: "SUPABASE_SERVICE_ROLE_KEY", present: false, scope: "admin" },
  ],
};

/**
 * The banner reads the preflight server *route* (`/api/env-preflight`) with a
 * plain fetch, deliberately bypassing server-function middleware so a missing
 * variable cannot break the very check that reports it. The stub therefore has
 * to intercept that exact path.
 */
const PREFLIGHT_ROUTE = "**/api/env-preflight";

/** Serves the preflight response, optionally slowly so the loading state is observable. */
async function stubPreflight(page: Page, options: { delayMs?: number; fail?: boolean } = {}) {
  await page.route(PREFLIGHT_ROUTE, async (route) => {
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
    if (options.fail) {
      await route.fulfill({ status: 500, body: "boom" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MISSING_PAYLOAD),
    });
  });
}

test.describe("env preflight banner", () => {
  test("renders missing variables and announces them via aria-live", async ({ page }) => {
    await stubPreflight(page);
    await page.goto("/");

    await expect(page.getByText("Server configuration incomplete")).toBeVisible();
    const status = page.getByRole("status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toContainText("2 environment variables still missing");
    await expect(status).toContainText("SUPABASE_SERVICE_ROLE_KEY");
    await expect(status).toContainText(/Next automatic check in .*(minute|second)/);
  });

  test("shows the loading state then success messaging for a manual run", async ({ page }) => {
    await stubPreflight(page, { delayMs: 700 });
    await page.goto("/");

    const runButton = page.getByRole("button", { name: /run preflight check now/i });
    await expect(runButton).toBeEnabled();
    await runButton.click();

    await expect(page.getByTestId("run-status")).toContainText("Running preflight check…");
    await expect(page.getByRole("status")).toContainText("Running Supabase environment preflight");
    await expect(page.getByTestId("run-status")).toContainText("Check complete", {
      timeout: 15_000,
    });
    await expect(runButton).toBeEnabled();
  });

  test("reports an error when the manual run fails", async ({ page }) => {
    await stubPreflight(page);
    await page.goto("/");
    await expect(page.getByRole("status")).toContainText("Preflight check complete");

    await stubPreflight(page, { fail: true });
    await page.getByRole("button", { name: /run preflight check now/i }).click();
    await expect(page.getByTestId("run-status")).toContainText("Check failed");
    await expect(page.getByRole("status")).toContainText("failed");
  });

  test("exports the selected number of recent checks as JSON and CSV", async ({ page }) => {
    await stubPreflight(page);
    await page.goto("/");
    await expect(page.getByText("Recent checks")).toBeVisible();

    await page.getByLabel("Number of recent checks to export").selectOption("10");

    const jsonDownload = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export results \(json\)/i }).click(),
    ]).then(([d]) => d);
    expect(jsonDownload.suggestedFilename()).toMatch(
      /^env-preflight-.*-last-10-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/,
    );

    const csvDownload = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export results \(csv\)/i }).click(),
    ]).then(([d]) => d);
    expect(csvDownload.suggestedFilename()).toMatch(
      /^env-preflight-.*-last-10-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.csv$/,
    );
  });

  test("clears the recent check history", async ({ page }) => {
    await stubPreflight(page);
    await page.goto("/");
    await expect(page.getByText("Recent checks")).toBeVisible();

    await page.getByRole("button", { name: /clear history/i }).click();
    await expect(page.getByText("Recent checks")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /export results \(csv\)/i })).toBeDisabled();
  });
});
