#!/usr/bin/env node
/**
 * Migration-order and duplicate-version gate.
 *
 * Enforces: unique version prefixes, strictly increasing filename order,
 * a parseable UTC timestamp per migration, and no empty migration files.
 */
import { readFileSync, readdirSync } from "node:fs";

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));
const errors = [];
const versions = new Map();

for (const file of files) {
  const match = /^(\d{14})_[^/]+\.sql$/.exec(file);
  if (!match) {
    errors.push(`${file}: filename is not <14-digit-timestamp>_<name>.sql`);
    continue;
  }
  const version = match[1];
  if (versions.has(version)) errors.push(`${file}: duplicate version ${version} (also ${versions.get(version)})`);
  versions.set(version, file);
  const [y, mo, d, h, mi, s] = [
    version.slice(0, 4), version.slice(4, 6), version.slice(6, 8),
    version.slice(8, 10), version.slice(10, 12), version.slice(12, 14),
  ].map(Number);
  const stamp = Date.UTC(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(stamp) || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) {
    errors.push(`${file}: version ${version} is not a valid UTC timestamp`);
  }
  if (readFileSync(`${DIR}/${file}`, "utf8").trim().length === 0) {
    errors.push(`${file}: migration is empty`);
  }
}

const sorted = [...files].sort();
if (sorted.join("|") !== files.slice().sort().join("|")) errors.push("internal sort inconsistency");
for (let i = 1; i < sorted.length; i += 1) {
  if (sorted[i].slice(0, 14) <= sorted[i - 1].slice(0, 14)) {
    errors.push(`${sorted[i]}: version does not increase after ${sorted[i - 1]}`);
  }
}

if (errors.length) {
  console.error("[migration-order] FAILED:");
  for (const error of errors) console.error("  " + error);
  process.exit(1);
}
console.log(`[migration-order] PASS — ${files.length} migrations, unique and strictly ordered.`);
