import { expect, test } from "@playwright/test";

const PREFLIGHT_ROUTE = "**/api/env-preflight";
const VIEWPORTS = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 900 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`public shell is responsive and keyboard usable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route(PREFLIGHT_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, missing: [], variables: [] }),
      }),
    );
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "LearnFlow", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );

    if (viewport.width < 1024) {
      const menu = page.getByRole("button", { name: "Open menu" });
      await expect(menu).toBeVisible();
      const box = await menu.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      await menu.click();
      await expect(page.getByRole("navigation", { name: "Primary mobile" })).toBeVisible();
    } else {
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    }

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your privacy choices" })).toBeVisible();
    await page.getByRole("button", { name: "Reject all" }).click();
    await expect(page.getByRole("heading", { name: "Your privacy choices" })).toHaveCount(0);
  });
}
