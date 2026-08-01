import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("./harness", import.meta.url));
const src = fileURLToPath(new URL("../src", import.meta.url));

/** Standalone harness used only by the Playwright end-to-end tests. */
export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@tanstack/react-start",
        replacement: fileURLToPath(new URL("./harness/react-start-mock.ts", import.meta.url)),
      },
      { find: "@", replacement: src },
    ],
  },
  server: { port: 5199, strictPort: true },
});
