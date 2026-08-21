#!/usr/bin/env node
/**
 * Browser-bundle leakage gate.
 *
 * Fails when server-only material reaches a client asset: service-role or
 * secret key values, server-only module markers, or the admin Supabase client.
 * Run after `bun run build`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Only the browser-facing output is scanned; dist/server legitimately
// contains server-only modules.
const CLIENT_DIRS = [".output/public", "dist/client", "dist/public"].filter(existsSync);
if (CLIENT_DIRS.length === 0) {
  console.error(
    "[bundle-scan] FAILED — no client build output found; run the production build first.",
  );
  process.exit(1);
}

const FORBIDDEN = [
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key value"],
  [/\bSUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'`][^"'`]+["'`]/, "inlined service-role key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
  [/integrations\/supabase\/client\.server/, "server-only Supabase admin module"],
  [/@tanstack\/react-start\/server-only/, "server-only marker in a client asset"],
];

const SCANNABLE = /\.(js|mjs|cjs|css|html|json|map)$/i;
const findings = [];
let scanned = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (SCANNABLE.test(entry) && stat.size < 20_000_000) {
      scanned += 1;
      const text = readFileSync(full, "utf8");
      for (const [pattern, label] of FORBIDDEN) {
        if (pattern.test(text)) findings.push(`${full}: ${label}`);
      }
    }
  }
}

for (const dir of CLIENT_DIRS) walk(dir);

if (findings.length) {
  console.error("[bundle-scan] FAILED — server-only material in client assets:");
  for (const finding of findings) console.error("  " + finding);
  process.exit(1);
}
console.log(
  `[bundle-scan] PASS — ${scanned} client asset(s) scanned in ${CLIENT_DIRS.join(", ")}.`,
);
