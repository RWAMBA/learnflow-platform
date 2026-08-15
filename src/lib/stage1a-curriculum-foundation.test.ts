/**
 * Structural verification of the PREPARED Phase 10 Stage 1A curriculum-foundation
 * migration. These tests do not touch a database: no isolated/shadow Postgres is
 * available in this environment, so every runtime-behaviour requirement is asserted
 * structurally against the migration SQL that will produce it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MFA_ENFORCEMENT_ENABLED } from "@/features/security/mfa";

const MIGRATION_FILE = "20260815191500_phase10_stage1a_curriculum_foundation.sql";
const SQL = readFileSync(`supabase/migrations/${MIGRATION_FILE}`, "utf8");
const MIGRATIONS = readdirSync("supabase/migrations").sort();

const has = (needle: string) => SQL.includes(needle);
/** SQL with `--` comments stripped, for destructive-keyword scanning. */
const SQL_CODE = SQL.replace(/^\s*--.*$/gm, "");

/**
 * Authoritative external source of the pre-Stage-1A curriculum_versions policy
 * baseline: the SEC-005 hardening migration. The Stage 1A fail-closed
 * precondition block is compared against THIS file, never against constants
 * written into this test and never against Stage 1A's own later target
 * CREATE POLICY statements.
 */
const SEC005_FILE = "20260809194700_harden_curriculum_authorization.sql";
const SEC005_SQL = readFileSync(`supabase/migrations/${SEC005_FILE}`, "utf8");

const CV_POLICIES = [
  "curriculum_versions_select",
  "curriculum_versions_insert",
  "curriculum_versions_update",
  "curriculum_versions_delete",
] as const;

interface PolicyFields {
  command: string;
  role: string;
  using: string;
  check: string;
}

/* ------------------------------------------------------------------ *
 * Conservative boolean-structure normalisation.
 *
 * The predicate is parsed into a boolean tree (NOT > AND > OR) whose atoms
 * are compared as text after removing only cosmetic noise: keyword/identifier
 * case, whitespace, PostgreSQL's explicit `::text` casts on string literals,
 * and parentheses that merely restate natural precedence. Operand order,
 * operators, nesting shape, function names and arguments are preserved
 * exactly, so two predicates with different authorization logic can never
 * normalise to the same value.
 * ------------------------------------------------------------------ */
type BoolNode =
  | { kind: "atom"; text: string }
  | { kind: "not"; child: BoolNode }
  | { kind: "op"; op: "and" | "or"; left: BoolNode; right: BoolNode };

function parseBoolean(input: string): BoolNode {
  let i = 0;
  const src = input;

  const skipWs = () => {
    while (i < src.length && /\s/.test(src[i]!)) i += 1;
  };
  const peekWord = (): string => {
    skipWs();
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    return m ? m[0]!.toLowerCase() : "";
  };
  const eatWord = (word: string) => {
    skipWs();
    i += word.length;
  };

  const readAtom = (): BoolNode => {
    skipWs();
    const start = i;
    let depth = 0;
    let inString = false;
    while (i < src.length) {
      const char = src[i]!;
      if (char === "'") {
        inString = !inString;
        i += 1;
        continue;
      }
      if (inString) {
        i += 1;
        continue;
      }
      if (char === "(") {
        depth += 1;
        i += 1;
        continue;
      }
      if (char === ")") {
        if (depth === 0) break;
        depth -= 1;
        i += 1;
        continue;
      }
      if (depth === 0 && /[A-Za-z_]/.test(char)) {
        const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))![0]!.toLowerCase();
        // A boolean connective at depth 0 ends the atom. `is`/`not`/`null`
        // belong to the atom (`organization_id IS NOT NULL`).
        if (word === "and" || word === "or") break;
        i += word.length;
        continue;
      }
      i += 1;
    }
    const raw = src.slice(start, i).trim();
    if (raw === "") throw new Error(`empty atom in predicate: ${input}`);
    return { kind: "atom", text: normalizeAtom(raw) };
  };

  const parsePrimary = (): BoolNode => {
    skipWs();
    if (peekWord() === "not") {
      eatWord("not");
      return { kind: "not", child: parsePrimary() };
    }
    if (src[i] === "(") {
      i += 1;
      const node = parseOr();
      skipWs();
      if (src[i] !== ")") throw new Error(`unbalanced parentheses in predicate: ${input}`);
      i += 1;
      return node;
    }
    return readAtom();
  };

  const parseAnd = (): BoolNode => {
    let left = parsePrimary();
    while (peekWord() === "and") {
      eatWord("and");
      left = { kind: "op", op: "and", left, right: parsePrimary() };
    }
    return left;
  };

  function parseOr(): BoolNode {
    let left = parseAnd();
    while (peekWord() === "or") {
      eatWord("or");
      left = { kind: "op", op: "or", left, right: parseAnd() };
    }
    return left;
  }

  const tree = parseOr();
  skipWs();
  if (i !== src.length) throw new Error(`trailing input in predicate: ${input.slice(i)}`);
  return tree;
}

function normalizeAtom(raw: string): string {
  let text = raw.toLowerCase();
  text = text.replace(/::text/g, "");
  text = text.replace(/\s+/g, " ");
  text = text.replace(/\s*([(),])\s*/g, "$1");
  text = text.replace(/\s*(=|<>|!=)\s*/g, "$1");
  // Strip parentheses that fully enclose the atom, e.g. `(organization_id is null)`.
  while (text.startsWith("(") && text.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let k = 0; k < text.length; k += 1) {
      if (text[k] === "(") depth += 1;
      else if (text[k] === ")") {
        depth -= 1;
        if (depth === 0 && k < text.length - 1) wraps = false;
      }
    }
    if (!wraps) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

function render(node: BoolNode): string {
  if (node.kind === "atom") return node.text;
  if (node.kind === "not") return `not(${render(node.child)})`;
  return `${node.op}(${render(node.left)},${render(node.right)})`;
}

/** Canonical, order- and shape-preserving form of a row-security predicate. */
function canonical(expression: string): string {
  return render(parseBoolean(expression));
}

/** Balanced-parenthesis clause starting at the `(` after `index`. */
function balanced(sql: string, index: number): string {
  const open = sql.indexOf("(", index);
  if (open === -1) throw new Error("clause parenthesis not found");
  let depth = 0;
  let inString = false;
  for (let k = open; k < sql.length; k += 1) {
    const char = sql[k];
    if (char === "'") inString = !inString;
    else if (!inString && char === "(") depth += 1;
    else if (!inString && char === ")") {
      depth -= 1;
      if (depth === 0) return sql.slice(open + 1, k);
    }
  }
  throw new Error("unbalanced clause");
}

/**
 * Independently extracts the LATEST `CREATE POLICY` definition for each named
 * curriculum_versions policy from the SEC-005 source migration.
 */
function extractSec005Policies(sql: string): Map<string, PolicyFields> {
  const found = new Map<string, PolicyFields>();
  const counts = new Map<string, number>();
  const re =
    /CREATE\s+POLICY\s+(curriculum_versions_\w+)\s+ON\s+public\.curriculum_versions\s+FOR\s+(\w+)\s+TO\s+([A-Za-z0-9_, ]+?)\s+(USING|WITH\s+CHECK)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql))) {
    const name = match[1]!.toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
    const bodyStart = match.index + match[0].length - 1;
    const first = balanced(sql, bodyStart);
    let using = "";
    let check = "";
    let cursor = bodyStart + first.length + 2;
    if (/^using$/i.test(match[4]!.replace(/\s+/g, " "))) {
      using = first;
      const rest = sql.slice(cursor, cursor + 200);
      const wc = /^\s*WITH\s+CHECK\s*\(/i.exec(rest);
      if (wc) {
        check = balanced(sql, cursor + wc.index);
        cursor += wc.index + check.length + wc[0].length;
      }
    } else {
      check = first;
    }
    found.set(name, {
      command: match[2]!.toUpperCase(),
      role: match[3]!.trim().toLowerCase(),
      using,
      check,
    });
  }
  for (const [name, count] of counts) {
    if (count !== 1) throw new Error(`policy ${name} defined ${count} times in SEC-005 source`);
  }
  return found;
}

/**
 * Extracts the expected baseline expressions from the Stage 1A migration's
 * FAIL-CLOSED PRECONDITION BLOCK ONLY. The slice is bounded by the `$precheck$`
 * delimiters and further narrowed to the statement that raises
 * `curriculum_versions policy baseline mismatch`, so the later target
 * `CREATE POLICY` section can never be read by mistake.
 */
function extractStage1aPrecondition(sql: string): Map<string, PolicyFields> {
  const blockStart = sql.indexOf("$precheck$");
  const blockEnd = sql.lastIndexOf("$precheck$");
  if (blockStart === -1 || blockEnd <= blockStart) throw new Error("precheck block not found");
  const block = sql.slice(blockStart, blockEnd);
  const raiseAt = block.indexOf("curriculum_versions policy baseline mismatch");
  if (raiseAt === -1) throw new Error("policy baseline precondition not found");
  // Walk back to the start of the guarding IF statement.
  const ifAt = block.lastIndexOf("IF NOT EXISTS", raiseAt);
  const scope = block.slice(ifAt, raiseAt);
  if (/CREATE\s+POLICY/i.test(scope)) throw new Error("precondition scope leaked into target DDL");

  const out = new Map<string, PolicyFields>();
  for (const chunk of scope.split(/\bOR\s+NOT\s+EXISTS\b/i)) {
    const head =
      /policyname\s*=\s*'(curriculum_versions_\w+)'\s+AND\s+cmd\s*=\s*'(\w+)'\s+AND\s+roles\s*=\s*'\{([a-z0-9_,]+)\}'/i.exec(
        chunk,
      );
    if (!head) continue;
    const tail = chunk.slice(head.index + head[0].length);
    const grab = (keyword: "qual" | "with_check"): string => {
      const m = new RegExp(`\\b${keyword}\\s*=\\s*'([\\s\\S]*?)'\\s*(?:AND\\b|$)`, "i").exec(tail);
      return m ? m[1]!.replace(/''/g, "'") : "";
    };
    const name = head[1]!.toLowerCase();
    if (out.has(name)) throw new Error(`duplicate precondition entry for ${name}`);
    out.set(name, {
      command: head[2]!.toUpperCase(),
      role: head[3]!.trim().toLowerCase(),
      using: grab("qual"),
      check: grab("with_check"),
    });
  }
  return out;
}

const SEC005_POLICIES = extractSec005Policies(SEC005_SQL);
const STAGE1A_PRECONDITION = extractStage1aPrecondition(SQL);

describe("Stage 1A — transaction and safety envelope", () => {
  it("is exactly one explicit transaction", () => {
    expect(SQL.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(SQL.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(SQL.indexOf("BEGIN;")).toBeLessThan(SQL.indexOf("COMMIT;"));
    expect(SQL).not.toMatch(/\bROLLBACK\b/);
  });

  it("never conceals drift with IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE", () => {
    // PL/pgSQL `IF NOT EXISTS (SELECT ...)` guards are assertions, not DDL concealment.
    expect(SQL_CODE).not.toMatch(/(CREATE|ADD|ALTER)\s+[A-Z ]*IF\s+NOT\s+EXISTS/i);
    expect(SQL_CODE).not.toMatch(/DROP\s+\w+\s+IF\s+EXISTS/i);
    expect(SQL_CODE).not.toMatch(/CREATE\s+OR\s+REPLACE/i);
  });

  it("performs no destructive legacy rename or drop", () => {
    expect(SQL_CODE).not.toMatch(/RENAME/i);
    expect(SQL_CODE).not.toMatch(/DROP\s+TABLE/i);
    expect(SQL_CODE).not.toMatch(/DROP\s+COLUMN/i);
    expect(SQL_CODE).not.toMatch(/TRUNCATE\s+(TABLE\s+)?public\./i);
    expect(SQL_CODE).not.toMatch(/DELETE\s+FROM/i);
  });

  it("is the newest migration and later than the SEC-006 ACL migration", () => {
    expect(MIGRATIONS.at(-1)).toBe(MIGRATION_FILE);
    expect(MIGRATION_FILE > "20260815110738").toBe(true);
  });
});

describe("Stage 1A — fail-closed preconditions", () => {
  it("asserts absence of every new table, column, constraint, index, trigger, function and policy", () => {
    const precheck = SQL.slice(SQL.indexOf("$precheck$"), SQL.lastIndexOf("$precheck$"));
    for (const marker of [
      "public.curriculum_providers",
      "public.education_stages",
      "public.subject_groups",
      "provider_id",
      "is_current",
      "education_stage_id",
      "academic_level_id",
      "curricula_provider_id_fkey",
      "curriculum_versions_one_current_per_curriculum",
      "curriculum_providers_set_updated_at",
      "enforce_curriculum_version_lifecycle",
      "curriculum_providers_write",
    ]) {
      expect(precheck).toContain(marker);
    }
    expect(precheck).toContain("pg_constraint");
    expect(precheck).toContain("pg_indexes");
    expect(precheck).toContain("pg_trigger");
    expect(precheck).toContain("pg_policies");
  });

  it("requires public.set_updated_at() with the trigger signature", () => {
    expect(has("p.proname = 'set_updated_at'")).toBe(true);
    expect(has("pg_get_function_result(p.oid) = 'trigger'")).toBe(true);
  });

  it("aborts unless the tenant-owned curriculum version count is zero", () => {
    expect(has("WHERE organization_id IS NOT NULL")).toBe(true);
    expect(has("tenant-owned curriculum versions require data-disposition review")).toBe(true);
  });

  it("has a curriculum_versions policy-baseline precondition", () => {
    expect(has("curriculum_versions policy baseline mismatch")).toBe(true);
  });

  it("every assertion raises and therefore aborts the whole transaction", () => {
    expect(SQL.match(/RAISE EXCEPTION 'stage1a precondition failed/g)?.length ?? 0).toBeGreaterThan(
      8,
    );
  });
});

describe("Stage 1A — new tables", () => {
  it("creates exactly the three new tables", () => {
    const created = [...SQL.matchAll(/CREATE TABLE (public\.\w+)/g)].map((m) => m[1]);
    expect(created).toEqual([
      "public.curriculum_providers",
      "public.education_stages",
      "public.subject_groups",
    ]);
  });

  it("defines curriculum_providers columns and unique code", () => {
    expect(has("code text NOT NULL")).toBe(true);
    expect(has("CONSTRAINT curriculum_providers_code_key UNIQUE (code)")).toBe(true);
  });

  it("defines education_stages columns, FK actions, unique sequence and lifecycle check", () => {
    expect(has("curriculum_version_id uuid NOT NULL")).toBe(true);
    expect(has("sequence_order integer NOT NULL DEFAULT 1")).toBe(true);
    expect(has("status text NOT NULL DEFAULT 'draft'")).toBe(true);
    expect(
      has("REFERENCES public.curriculum_versions(id)\n    ON DELETE RESTRICT ON UPDATE RESTRICT"),
    ).toBe(true);
    expect(
      has("education_stages_version_sequence_key UNIQUE (curriculum_version_id, sequence_order)"),
    ).toBe(true);
    expect(
      has(
        "education_stages_status_chk CHECK (status IN ('draft','review','published','archived'))",
      ),
    ).toBe(true);
  });

  it("defines subject_groups with a unique name", () => {
    expect(has("CONSTRAINT subject_groups_name_key UNIQUE (name)")).toBe(true);
  });

  it("attaches a BEFORE UPDATE set_updated_at trigger to each new table", () => {
    for (const table of ["curriculum_providers", "education_stages", "subject_groups"]) {
      expect(
        has(`CREATE TRIGGER ${table}_set_updated_at\n  BEFORE UPDATE ON public.${table}`),
      ).toBe(true);
    }
    expect(SQL.match(/EXECUTE FUNCTION public\.set_updated_at\(\)/g)).toHaveLength(3);
  });
});

describe("Stage 1A — grants, revocations and RLS", () => {
  const tables = ["curriculum_providers", "education_stages", "subject_groups"];

  it("revokes PUBLIC and anon on every new table", () => {
    for (const t of tables) {
      expect(has(`REVOKE ALL ON public.${t} FROM PUBLIC;`)).toBe(true);
      expect(has(`REVOKE ALL ON public.${t} FROM anon;`)).toBe(true);
    }
  });

  it("grants authenticated exactly SELECT, INSERT, UPDATE, DELETE", () => {
    for (const t of tables) {
      expect(has(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO authenticated;`)).toBe(
        true,
      );
    }
    expect(SQL).not.toMatch(/TRUNCATE[^;]*TO authenticated/);
    expect(SQL).not.toMatch(/REFERENCES[^;]*TO authenticated/);
    expect(SQL).not.toMatch(/TRIGGER[^;]*TO authenticated/);
  });

  it("grants server-only privileges to service_role", () => {
    for (const t of tables) {
      expect(
        has(
          `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.${t} TO service_role;`,
        ),
      ).toBe(true);
    }
  });

  it("grants nothing to anon anywhere", () => {
    expect(SQL).not.toMatch(/GRANT[^;]*TO anon/i);
  });

  it("enables RLS on every new table", () => {
    for (const t of tables) {
      expect(has(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`)).toBe(true);
    }
  });
});

describe("Stage 1A — policies", () => {
  it("creates exactly the six new policies with the reviewed shapes", () => {
    for (const t of ["curriculum_providers", "education_stages", "subject_groups"]) {
      expect(
        has(
          `CREATE POLICY ${t}_select ON public.${t}\n  FOR SELECT TO authenticated USING (true);`,
        ),
      ).toBe(true);
      expect(
        has(
          `CREATE POLICY ${t}_write ON public.${t}\n  FOR ALL TO authenticated\n  USING (app_private.is_platform_admin())\n  WITH CHECK (app_private.is_platform_admin());`,
        ),
      ).toBe(true);
    }
  });

  it("ordinary authenticated users may read reference tables but not write them", () => {
    // read: USING (true) on every select policy; write: platform-admin only.
    expect(SQL.match(/FOR SELECT TO authenticated USING \(true\)/g)).toHaveLength(4);
    expect(SQL.match(/app_private\.is_platform_admin\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(
      10,
    );
  });

  it("replaces the four curriculum_versions policies with exact DROP statements", () => {
    for (const name of ["select", "insert", "update", "delete"]) {
      expect(has(`DROP POLICY curriculum_versions_${name} ON public.curriculum_versions;`)).toBe(
        true,
      );
    }
    expect(SQL).not.toMatch(/DROP POLICY IF EXISTS/i);
  });

  it("denies Organization Administrator and tenant-owned curriculum version writes", () => {
    expect(has("WITH CHECK (app_private.is_platform_admin() AND organization_id IS NULL);")).toBe(
      true,
    );
    expect(
      has(
        "CREATE POLICY curriculum_versions_update ON public.curriculum_versions\n  FOR UPDATE TO authenticated\n  USING (app_private.is_platform_admin())",
      ),
    ).toBe(true);
    expect(
      has(
        "CREATE POLICY curriculum_versions_delete ON public.curriculum_versions\n  FOR DELETE TO authenticated\n  USING (app_private.is_platform_admin());",
      ),
    ).toBe(true);
  });

  it("introduces no AAL2 term during Stage 1A", () => {
    expect(SQL).not.toMatch(/has_aal2/);
    expect(MFA_ENFORCEMENT_ENABLED).toBe(false);
  });

  it("scopes every policy to authenticated only", () => {
    const roles = [...SQL.matchAll(/FOR (?:SELECT|INSERT|UPDATE|DELETE|ALL) TO (\w+)/g)].map(
      (m) => m[1],
    );
    expect(new Set(roles)).toEqual(new Set(["authenticated"]));
  });
});

describe("Stage 1A — additive existing-table changes", () => {
  it("adds exactly nine columns to existing tables", () => {
    const added = [...SQL.matchAll(/ALTER TABLE (public\.\w+) ADD COLUMN (\w+)/g)].map(
      (m) => `${m[1]}.${m[2]}`,
    );
    expect(added).toEqual([
      "public.curricula.provider_id",
      "public.curriculum_versions.is_current",
      "public.grades.education_stage_id",
      "public.grades.status",
      "public.grades.published_at",
      "public.subjects.academic_level_id",
      "public.subjects.track_id",
      "public.subjects.subject_group_id",
    ]);
    // subjects.published_at pre-exists and is asserted, not re-added.
    expect(has("subjects.published_at not in the expected shape")).toBe(true);
    expect(added.length + 1).toBe(9);
  });

  it("creates the five explicit FK indexes plus the partial unique index", () => {
    const idx = [...SQL.matchAll(/CREATE (?:UNIQUE )?INDEX (\w+)/g)].map((m) => m[1]);
    expect(idx).toEqual([
      "curricula_provider_id_idx",
      "curriculum_versions_one_current_per_curriculum",
      "grades_education_stage_id_idx",
      "subjects_academic_level_id_idx",
      "subjects_track_id_idx",
      "subjects_subject_group_id_idx",
    ]);
    expect(
      has(
        "curriculum_versions_one_current_per_curriculum\n  ON public.curriculum_versions(curriculum_id) WHERE is_current;",
      ),
    ).toBe(true);
  });

  it("uses the reviewed foreign-key actions", () => {
    expect(
      has(
        "curricula_provider_id_fkey\n  FOREIGN KEY (provider_id) REFERENCES public.curriculum_providers(id)\n  ON DELETE RESTRICT ON UPDATE RESTRICT",
      ),
    ).toBe(true);
    for (const [c, ref] of [
      ["grades_education_stage_id_fkey", "public.education_stages(id)"],
      ["subjects_academic_level_id_fkey", "public.grades(id)"],
      ["subjects_track_id_fkey", "public.pathways(id)"],
      ["subjects_subject_group_id_fkey", "public.subject_groups(id)"],
    ]) {
      expect(SQL).toContain(c);
      expect(SQL).toContain(`REFERENCES ${ref}\n  ON DELETE SET NULL ON UPDATE RESTRICT`);
    }
  });

  it("enforces platform ownership and current-only-when-published on curriculum_versions", () => {
    expect(has("curriculum_versions_org_null_chk CHECK (organization_id IS NULL)")).toBe(true);
    expect(
      has(
        "curriculum_versions_current_published_chk\n  CHECK (NOT is_current OR status = 'published')",
      ),
    ).toBe(true);
    expect(has("ADD COLUMN is_current boolean NOT NULL DEFAULT false")).toBe(true);
    expect(SQL).not.toMatch(/UPDATE public\.curriculum_versions SET is_current/);
    expect(SQL).not.toMatch(/DROP CONSTRAINT/i);
  });

  it("publishes existing grades, defaults future grades to draft and validates the check", () => {
    const order = [
      "ALTER TABLE public.grades ADD COLUMN status text;",
      "UPDATE public.grades SET status = 'published' WHERE status IS NULL;",
      "ALTER TABLE public.grades ALTER COLUMN status SET DEFAULT 'draft';",
      "grades_status_chk CHECK (status IN ('draft','review','published','archived')) NOT VALID;",
      "ALTER TABLE public.grades VALIDATE CONSTRAINT grades_status_chk;",
      "ALTER TABLE public.grades ALTER COLUMN status SET NOT NULL;",
    ];
    let cursor = -1;
    for (const step of order) {
      const at = SQL.indexOf(step);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(SQL).not.toMatch(/grades SET published_at/);
  });

  it("copies subject structure verbatim from the legacy columns and leaves grouping null", () => {
    expect(has("UPDATE public.subjects SET academic_level_id = grade_id;")).toBe(true);
    expect(has("UPDATE public.subjects SET track_id = pathway_id;")).toBe(true);
    expect(SQL).not.toMatch(/SET subject_group_id/);
    expect(SQL).not.toMatch(/subjects SET published_at/);
  });

  it("does not change pathways", () => {
    expect(SQL).not.toMatch(/ALTER TABLE public\.pathways/);
  });
});

describe("Stage 1A — curriculum version lifecycle", () => {
  it("creates a hardened trigger function with an empty search path", () => {
    expect(has("CREATE FUNCTION app_private.enforce_curriculum_version_lifecycle()")).toBe(true);
    expect(has("RETURNS trigger")).toBe(true);
    expect(has("LANGUAGE plpgsql")).toBe(true);
    expect(has("SECURITY INVOKER")).toBe(true);
    expect(has("SET search_path = ''")).toBe(true);
  });

  it("uses generic exception text with no identifiers", () => {
    const msgs = [...SQL.matchAll(/RAISE EXCEPTION '(curriculum version[^']*)'/g)].map((m) => m[1]);
    expect(msgs.length).toBeGreaterThanOrEqual(5);
    expect(new Set(msgs)).toEqual(new Set(["curriculum version lifecycle violation"]));
  });

  it("blocks deletion of published and archived rows", () => {
    expect(
      has("IF TG_OP = 'DELETE' THEN\n    IF OLD.status IN ('published','archived') THEN"),
    ).toBe(true);
  });

  it("blocks any update to an archived row", () => {
    expect(has("IF OLD.status = 'archived' THEN\n    RAISE EXCEPTION")).toBe(true);
  });

  it("allows only a status-only published -> archived transition and forces is_current false", () => {
    const published = SQL.slice(SQL.indexOf("IF OLD.status = 'published' THEN"));
    expect(published).toContain("IF NEW.status <> 'archived' THEN");
    for (const field of [
      "curriculum_id",
      "organization_id",
      "parent_version_id",
      "label",
      "notes",
      "published_at",
      "created_by",
      "created_at",
    ]) {
      expect(published).toContain(`NEW.${field} IS DISTINCT FROM OLD.${field}`);
    }
    expect(published).toContain("NEW.is_current := false;");
  });

  it("allows draft/review workflow transitions including direct archival", () => {
    const tail = SQL.slice(SQL.indexOf("-- Draft and review rows follow"));
    expect(tail).toContain("NEW.status NOT IN ('draft','review','published','archived')");
    expect(tail).toContain("IF NEW.status = 'archived' THEN\n    NEW.is_current := false;");
    expect(tail).toContain("IF NEW.is_current AND NEW.status <> 'published' THEN");
  });

  it("attaches a BEFORE UPDATE OR DELETE row trigger and locks the function down", () => {
    expect(
      has(
        "CREATE TRIGGER curriculum_versions_enforce_lifecycle\n  BEFORE UPDATE OR DELETE ON public.curriculum_versions\n  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_curriculum_version_lifecycle();",
      ),
    ).toBe(true);
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(
        has(
          `REVOKE ALL ON FUNCTION app_private.enforce_curriculum_version_lifecycle() FROM ${role};`,
        ),
      ).toBe(true);
    }
  });
});

describe("Stage 1A — scope containment", () => {
  it("inserts no seed data", () => {
    expect(SQL).not.toMatch(/INSERT INTO/i);
  });

  it("does not touch Stage 1B/1C or unrelated tables", () => {
    for (const table of [
      "lessons",
      "curriculum_resources",
      "topics",
      "strands",
      "sub_strands",
      "learning_outcomes",
      "student_curriculum_assignments",
      "competencies",
      "assessments",
    ]) {
      expect(SQL).not.toMatch(new RegExp(`ALTER TABLE public\\.${table}\\b`));
      expect(SQL).not.toMatch(new RegExp(`UPDATE public\\.${table}\\b`));
    }
  });

  it("leaves the SEC-006 stage-two package and security baseline files untouched", () => {
    const stageTwo = readFileSync("docs/sec-006-stage-two-enforcement.sql", "utf8");
    expect(stageTwo).toContain("has_aal2");
    expect(MIGRATIONS.some((n) => n.includes("stage_two"))).toBe(false);
  });
});

describe("Stage 1A — policy baseline proved against the SEC-005 source migration", () => {
  it("reads the authoritative SEC-005 migration as an external source", () => {
    expect(SEC005_SQL.length).toBeGreaterThan(0);
    expect(SEC005_FILE).toBe("20260809194700_harden_curriculum_authorization.sql");
    expect(MIGRATIONS).toContain(SEC005_FILE);
    // The proof must consult a second file, not only the Stage 1A migration.
    expect(SEC005_SQL).not.toBe(SQL);
  });

  it("finds exactly one definition of each of the four curriculum_versions policies", () => {
    expect([...SEC005_POLICIES.keys()].sort()).toEqual([...CV_POLICIES].sort());
    expect([...STAGE1A_PRECONDITION.keys()].sort()).toEqual([...CV_POLICIES].sort());
  });

  it("compares the precondition block, never Stage 1A's later target policies", () => {
    // Sanity: Stage 1A's target SELECT is USING (true), which must NOT be what
    // the precondition asserts — proving the extraction reads the right region.
    expect(SQL).toContain("CREATE POLICY curriculum_versions_select ON public.curriculum_versions");
    expect(canonical(STAGE1A_PRECONDITION.get("curriculum_versions_select")!.using)).not.toBe(
      canonical("true"),
    );
  });

  it.each(CV_POLICIES)("%s matches the SEC-005 source command, role and predicates", (name) => {
    const source = SEC005_POLICIES.get(name)!;
    const expected = STAGE1A_PRECONDITION.get(name)!;
    expect(source).toBeDefined();
    expect(expected).toBeDefined();

    expect(expected.command).toBe(source.command);
    expect(source.role).toBe("authenticated");
    expect(expected.role).toBe("authenticated");

    if (source.using !== "") {
      expect(canonical(expected.using)).toBe(canonical(source.using));
    } else {
      expect(expected.using).toBe("");
    }
    if (source.check !== "") {
      expect(canonical(expected.check)).toBe(canonical(source.check));
    } else {
      expect(expected.check).toBe("");
    }
  });

  it("verifies UPDATE carries both a USING and a WITH CHECK predicate", () => {
    const source = SEC005_POLICIES.get("curriculum_versions_update")!;
    const expected = STAGE1A_PRECONDITION.get("curriculum_versions_update")!;
    expect(source.using).not.toBe("");
    expect(source.check).not.toBe("");
    expect(expected.using).not.toBe("");
    expect(expected.check).not.toBe("");
    expect(canonical(expected.check)).toBe(canonical(source.check));
  });

  it("keeps tenant isolation and both SELECT branches", () => {
    const select = canonical(SEC005_POLICIES.get("curriculum_versions_select")!.using);
    expect(select).toContain("organization_id is null");
    expect(select).toContain("status='published'");
    expect(select).toContain("app_private.is_platform_admin()");
    // Boolean grouping: tenant isolation ANDed over the OR of the two branches.
    expect(select).toBe(
      canonical("organization_id IS NULL AND (status = 'published' OR app_private.is_platform_admin())"),
    );
    expect(canonical(STAGE1A_PRECONDITION.get("curriculum_versions_select")!.using)).toBe(select);
  });

  it("proves no write policy admits can_author_curriculum", () => {
    for (const name of ["curriculum_versions_insert", "curriculum_versions_update", "curriculum_versions_delete"] as const) {
      for (const clause of [SEC005_POLICIES.get(name)!, STAGE1A_PRECONDITION.get(name)!]) {
        expect(`${clause.using} ${clause.check}`).not.toContain("can_author_curriculum");
      }
    }
  });
});

describe("Stage 1A — predicate normalisation is conservative", () => {
  it("ignores only case, whitespace, text casts and redundant parentheses", () => {
    expect(canonical("((organization_id IS NULL) AND app_private.is_platform_admin())")).toBe(
      canonical("organization_id is null AND app_private.is_platform_admin()"),
    );
    expect(canonical("(status = 'published'::text)")).toBe(canonical("status = 'published'"));
  });

  it("never treats different boolean grouping or operand order as equivalent", () => {
    expect(canonical("a AND (b OR c)")).not.toBe(canonical("(a AND b) OR c"));
    expect(canonical("a AND b")).not.toBe(canonical("b AND a"));
    expect(canonical("a OR b")).not.toBe(canonical("a AND b"));
    expect(canonical("NOT a")).not.toBe(canonical("a"));
    expect(canonical("f(x)")).not.toBe(canonical("f(y)"));
  });

  it("fails loudly when a source migration is missing", () => {
    expect(() => readFileSync("supabase/migrations/does-not-exist.sql", "utf8")).toThrow();
  });
});
