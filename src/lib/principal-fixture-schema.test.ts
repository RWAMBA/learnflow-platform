/**
 * PR #7 — principal-test fixture schema drift guard.
 *
 * The disposable principal-test SQL fixtures insert into real tables. If a
 * fixture names a column the authoritative migration history never defines
 * (as `source_artifacts.title` once did), CI only discovers it after a full
 * disposable replay. These assertions tie every fixture column list to the
 * schema derived from the migration history so the drift cannot recur.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_DIR = "supabase/migrations";
const FIXTURE_DIR = "scripts/rls";

const migrationSql = readdirSync(MIGRATION_DIR)
  .sort()
  .map((name) => readFileSync(`${MIGRATION_DIR}/${name}`, "utf8"))
  .join("\n");

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function matchingParen(sql: string, open: number): number {
  let depth = 0;
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** table name -> defined columns, derived from CREATE TABLE + ADD COLUMN. */
export function schemaFromMigrations(sql: string): Map<string, Set<string>> {
  const schema = new Map<string, Set<string>>();
  const create = /CREATE TABLE (?:IF NOT EXISTS )?public\.([a-z_]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = create.exec(sql))) {
    const open = sql.indexOf("(", m.index + m[0].length - 1);
    const close = matchingParen(sql, open);
    if (close < 0) continue;
    const cols = schema.get(m[1]) ?? new Set<string>();
    for (const part of splitTopLevel(sql.slice(open + 1, close))) {
      const first = part.split(/\s+/)[0].toLowerCase();
      if (
        ["primary", "unique", "check", "constraint", "foreign", "exclude", "like"].includes(first)
      ) {
        continue;
      }
      cols.add(first);
    }
    schema.set(m[1], cols);
  }
  const add =
    /ALTER TABLE (?:IF EXISTS )?public\.([a-z_]+)[\s\S]{0,200}?ADD COLUMN (?:IF NOT EXISTS )?([a-z_]+)/gi;
  while ((m = add.exec(sql))) {
    const cols = schema.get(m[1]) ?? new Set<string>();
    cols.add(m[2].toLowerCase());
    schema.set(m[1], cols);
  }
  return schema;
}

/** every `INSERT INTO public.x (a, b)` column list found in a script. */
export function fixtureInserts(sql: string): { table: string; columns: string[] }[] {
  const out: { table: string; columns: string[] }[] = [];
  const re = /INSERT INTO public\.([a-z_]+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const open = sql.indexOf("(", m.index + m[0].length - 1);
    const close = matchingParen(sql, open);
    if (close < 0) continue;
    const columns = splitTopLevel(sql.slice(open + 1, close)).map((c) => c.toLowerCase());
    if (columns.every((c) => /^[a-z_]+$/.test(c))) out.push({ table: m[1], columns });
  }
  return out;
}

const SCHEMA = schemaFromMigrations(migrationSql);

const FIXTURE_FILES = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ name: `${FIXTURE_DIR}/${f}`, sql: readFileSync(`${FIXTURE_DIR}/${f}`, "utf8") }));

describe("authoritative source_artifacts schema", () => {
  it("defines the provenance columns and no display alias", () => {
    const cols = SCHEMA.get("source_artifacts");
    expect(cols).toBeDefined();
    for (const required of ["id", "rights_holder", "source_title", "source_type"]) {
      expect(cols?.has(required), required).toBe(true);
    }
    expect(cols?.has("title")).toBe(false);
    expect(cols?.has("artifact_type")).toBe(false);
  });

  it("uses source_title as the canonical display value in every fixture", () => {
    for (const { name, sql } of FIXTURE_FILES) {
      for (const insert of fixtureInserts(sql)) {
        if (insert.table !== "source_artifacts") continue;
        expect(insert.columns, name).not.toContain("title");
        expect(insert.columns, name).toContain("source_title");
        expect(insert.columns, name).toContain("rights_holder");
      }
    }
  });
});

describe("principal-test fixtures match the migration-derived schema", () => {
  it("inserts only columns the migration history defines", () => {
    for (const { name, sql } of FIXTURE_FILES) {
      for (const { table, columns } of fixtureInserts(sql)) {
        const known = SCHEMA.get(table);
        if (!known) continue; // auth/storage schema tables are out of scope
        for (const column of columns) {
          expect(known.has(column), `${name}: public.${table}.${column}`).toBe(true);
        }
      }
    }
  });
});
