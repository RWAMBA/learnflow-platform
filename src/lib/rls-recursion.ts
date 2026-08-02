/**
 * Detects self-referential (recursive) RLS policies.
 *
 * A policy on table T is recursive when its USING / WITH CHECK expression
 * queries T directly. Postgres then re-evaluates the same policy while
 * evaluating it, raising 42P17 "infinite recursion detected in policy".
 * The safe pattern is to resolve membership through a SECURITY DEFINER
 * helper (e.g. app_private.is_conversation_participant).
 */

export type PolicyDefinition = {
  name: string;
  table: string; // schema-qualified, e.g. "public.messages"
  expression: string; // USING + WITH CHECK bodies concatenated
};

export type RecursionViolation = {
  policy: string;
  table: string;
  reason: string;
};

/** Tables whose policies power the conversation/messaging queries. */
export const CONVERSATION_TABLES = [
  "public.conversations",
  "public.conversation_participants",
  "public.messages",
] as const;

function stripSqlComments(sql: string) {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

function normalize(sql: string) {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim();
}

/** Bodies of SECURITY DEFINER functions are exempt: they bypass RLS by design. */
function referencesTable(expression: string, table: string) {
  const bare = table.replace(/^public\./, "");
  const pattern = new RegExp(
    `\\b(from|join|update|into|exists\\s*\\(\\s*select[^)]*?from)\\s+(public\\.)?${bare}\\b`,
    "i",
  );
  return pattern.test(expression);
}

export function findRecursivePolicies(
  policies: PolicyDefinition[],
  tables: readonly string[] = CONVERSATION_TABLES,
): RecursionViolation[] {
  const scoped = new Set(tables.map((table) => table.toLowerCase()));
  const violations: RecursionViolation[] = [];

  for (const policy of policies) {
    const table = policy.table.toLowerCase();
    if (!scoped.has(table)) continue;
    const expression = normalize(policy.expression);
    if (!expression) continue;
    if (referencesTable(expression, table)) {
      violations.push({
        policy: policy.name,
        table: policy.table,
        reason: `policy expression queries ${policy.table} directly; use a SECURITY DEFINER helper instead`,
      });
    }
  }

  return violations;
}

type ParsedStatement = { kind: "create" | "drop"; name: string; table: string; expression: string };

function parseStatements(sql: string): ParsedStatement[] {
  const source = stripSqlComments(sql);
  const statements: ParsedStatement[] = [];

  const dropRe = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"?([\w]+)"?\s+ON\s+([\w.]+)/gi;
  const createRe =
    /CREATE\s+POLICY\s+"?([\w]+)"?\s+ON\s+([\w.]+)([\s\S]*?);(?=\s*(?:--|\/\*|[A-Z]{2,}|$))/gi;

  let match: RegExpExecArray | null;
  while ((match = dropRe.exec(source))) {
    statements.push({
      kind: "drop",
      name: match[1],
      table: match[2],
      expression: "",
      // position preserved via push order below
    });
    (statements[statements.length - 1] as ParsedStatement & { index?: number }).index = match.index;
  }
  while ((match = createRe.exec(source))) {
    statements.push({ kind: "create", name: match[1], table: match[2], expression: match[3] });
    (statements[statements.length - 1] as ParsedStatement & { index?: number }).index = match.index;
  }

  return statements.sort(
    (a, b) =>
      ((a as ParsedStatement & { index?: number }).index ?? 0) -
      ((b as ParsedStatement & { index?: number }).index ?? 0),
  );
}

/**
 * Replays migrations in filename order and returns the effective policy set,
 * so a later migration that fixes a recursive policy clears the violation.
 */
export function collectEffectivePolicies(
  migrations: { file: string; sql: string }[],
): PolicyDefinition[] {
  const effective = new Map<string, PolicyDefinition>();

  for (const migration of [...migrations].sort((a, b) => a.file.localeCompare(b.file))) {
    for (const statement of parseStatements(migration.sql)) {
      const key = `${statement.table.toLowerCase()}:${statement.name.toLowerCase()}`;
      if (statement.kind === "drop") {
        effective.delete(key);
      } else {
        effective.set(key, {
          name: statement.name,
          table: statement.table,
          expression: statement.expression,
        });
      }
    }
  }

  return [...effective.values()];
}