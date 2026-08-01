import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

/** Reuse a pre-installed Chromium build when this environment provides one. */
const PRESET_CHROMIUM = "/opt/ms-playwright/chromium-1194/chrome-linux/chrome";
const executablePath = existsSync(PRESET_CHROMIUM) ? PRESET_CHROMIUM : undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5199",
    viewport: { width: 1280, height: 1000 },
    launchOptions: { executablePath },
  },
  webServer: {
    command: "bunx vite --config e2e/vite.harness.config.ts",
    url: "http://localhost:5199",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
