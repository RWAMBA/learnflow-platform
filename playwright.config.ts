import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:5199", viewport: { width: 1280, height: 1000 } },
  webServer: {
    command: "bunx vite --config e2e/vite.harness.config.ts",
    url: "http://localhost:5199",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
