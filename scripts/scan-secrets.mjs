#!/usr/bin/env node
/**
 * Secret scan gate.
 *
 * Scans every tracked file for credential VALUES (never names) and fails the
 * build when one is committed. Names such as SUPABASE_SERVICE_ROLE_KEY are
 * expected in documentation and workflow prose, so only value shapes match.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
  [/\bservice_role\b[^\n]{0,40}\beyJ[A-Za-z0-9_-]{20,}/, "service_role JWT"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bghp_[A-Za-z0-9]{30,}\b/, "GitHub personal access token"],
  [/\bsk-[A-Za-z0-9]{32,}\b/, "OpenAI-style API key"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
];

const SKIP = /^(bun\.lock|bun\.lockb|package-lock\.json|src\/integrations\/supabase\/types\.ts)$/;
const BINARY = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|pdf|lockb)$/i;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const findings = [];

for (const file of files) {
  if (SKIP.test(file) || BINARY.test(file)) continue;
  let stat;
  try {
    stat = statSync(file);
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 2_000_000) continue;
  const text = readFileSync(file, "utf8");
  for (const [pattern, label] of PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const line = text.slice(0, match.index).split("\n").length;
      findings.push(`${file}:${line}: ${label}`);
    }
  }
}

if (findings.length) {
  console.error("[secret-scan] FAILED — credential material found:");
  for (const finding of findings) console.error("  " + finding);
  process.exit(1);
}
console.log(
  `[secret-scan] PASS — ${files.length} tracked files scanned, no credential values found.`,
);
