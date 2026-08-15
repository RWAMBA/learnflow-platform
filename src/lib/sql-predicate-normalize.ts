/**
 * Canonicalisation used ONLY by tests to compare two textual renderings of the
 * same SQL row-security predicate: the pre-stage-two definition captured from
 * the live `pg_policies` catalog, and the definition re-created by the rollback
 * section of `docs/sec-006-stage-two-enforcement.sql`.
 *
 * Normalisation is limited to lexical noise that Postgres itself introduces or
 * drops when it re-prints a stored expression:
 *   - case of keywords/identifiers
 *   - `::text` casts Postgres adds to string literals
 *   - the `public.` schema qualification Postgres omits when it is on the
 *     search_path
 *   - the output alias Postgres prints for a bare function call in a sub-select
 *   - whitespace and line wrapping
 *   - grouping parentheses that only restate the natural precedence of
 *     `and` (tighter) over `or` (looser)
 *
 * Nothing semantic is normalised: operand order, operators, function names,
 * arguments, `is null` / `is not null`, sub-selects and `exists` clauses must
 * match exactly. Grouping-paren removal is only sound for predicates whose
 * parentheses agree with natural precedence (no `(a or b) and c`); a predicate
 * of that shape is rejected by `assertPrecedenceUniform` below rather than
 * silently compared.
 */

/** Removes parentheses that group sub-expressions, keeping call parentheses. */
function stripGroupingParens(input: string): string {
  const drop = new Set<number>();
  const stack: { index: number; grouping: boolean }[] = [];
  let inString = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === "'") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "(") {
      let j = i - 1;
      while (j >= 0 && input[j] === " ") j -= 1;
      const previous = j >= 0 ? input[j]! : "";
      const isCall = /[A-Za-z0-9_]/.test(previous);
      stack.push({ index: i, grouping: !isCall });
      continue;
    }
    if (char === ")") {
      const open = stack.pop();
      if (open?.grouping) {
        drop.add(open.index);
        drop.add(i);
      }
    }
  }
  let out = "";
  for (let i = 0; i < input.length; i += 1) if (!drop.has(i)) out += input[i];
  return out;
}

/** Throws when a predicate relies on parentheses that override precedence. */
export function assertPrecedenceUniform(expression: string): void {
  // `(… or …) and` / `and (… or …)` are the only shapes whose meaning depends
  // on the grouping parentheses this comparator removes.
  const collapsed = expression.toLowerCase().replace(/\s+/g, " ");
  const risky = /\bor\b[^()]*\)\s*and\b/.test(collapsed);
  if (risky) {
    throw new Error(`predicate relies on precedence-overriding parentheses: ${expression}`);
  }
}

export function canonicalizeSqlPredicate(expression: string): string {
  const trimmed = expression.trim();
  if (trimmed === "") return "";
  assertPrecedenceUniform(trimmed);
  let text = trimmed.toLowerCase();
  text = text.replace(/::text/g, "");
  text = text.replace(/\bpublic\./g, "");
  // `select app_private.auth_organization_ids() as auth_organization_ids`
  text = text.replace(/\s+as\s+[a-z_][a-z0-9_]*(?=\s*\)|\s*,|\s*$)/g, "");
  text = text.replace(/\s+/g, " ");
  text = stripGroupingParens(text);
  text = text.replace(/\s*([(),])\s*/g, "$1");
  text = text.replace(/\s*(=|<>|!=)\s*/g, "$1");
  return text.replace(/\s+/g, " ").trim();
}

export interface ParsedPolicy {
  policy: string;
  table: string;
  command: string;
  roles: string[];
  using: string;
  check: string;
}

/** Extracts `create policy` statements, expanding the `foreach` helper loop. */
export function parseCreatePolicyStatements(sql: string): ParsedPolicy[] {
  const statements: string[] = [];

  // 1. Literal statements.
  const literal = /create\s+policy\s+/gi;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(sql))) {
    const start = match.index;
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let i = start; i < sql.length; i += 1) {
      const char = sql[i];
      if (char === "'") inString = !inString;
      else if (!inString && char === "(") depth += 1;
      else if (!inString && char === ")") depth -= 1;
      else if (!inString && char === ";" && depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) continue;
    const statement = sql.slice(start, end);
    // Templates inside the do-block are handled separately.
    if (!statement.includes("%I")) statements.push(statement);
  }

  // 2. `foreach t in array array[...]` templates.
  const loop = /foreach\s+t\s+in\s+array\s+array\[([^\]]+)\]([\s\S]*?)end loop;/gi;
  while ((match = loop.exec(sql))) {
    const tables = match[1]!.split(",").map((entry) => entry.trim().replace(/'/g, ""));
    const body = match[2]!;
    const templates = body.match(/'create policy[\s\S]*?'(?=\s*,)/gi) ?? [];
    for (const table of tables) {
      for (const template of templates) {
        const suffix = /%I on/.test(template)
          ? (/for\s+(insert|update|delete|all)/i.exec(template)?.[1]?.toLowerCase() ?? "")
          : "";
        statements.push(
          template
            .slice(1, -1)
            .replace("%I", `${table}_${suffix}`)
            .replace("%I", table)
            .replace(/''/g, "'"),
        );
      }
    }
  }

  return statements.map((statement) => {
    const header =
      /create\s+policy\s+([a-z0-9_]+)\s+on\s+(?:public\.)?([a-z0-9_]+)\s+for\s+([a-z]+)\s+to\s+([a-z0-9_,\s]+?)\s+(?:using|with\s+check)\b/i.exec(
        statement.replace(/\s+/g, " "),
      );
    if (!header) throw new Error(`unparsable policy statement: ${statement.slice(0, 120)}`);
    return {
      policy: header[1]!,
      table: header[2]!,
      command: header[3]!.toUpperCase(),
      roles: header[4]!.split(",").map((role) => role.trim()),
      using: clause(statement, "using"),
      check: clause(statement, "with check"),
    };
  });
}

function clause(statement: string, keyword: "using" | "with check"): string {
  const pattern = keyword === "using" ? /(^|\s)using\s*\(/i : /with\s+check\s*\(/i;
  const found = pattern.exec(statement);
  if (!found) return "";
  const open = statement.indexOf("(", found.index);
  let depth = 0;
  let inString = false;
  for (let i = open; i < statement.length; i += 1) {
    const char = statement[i];
    if (char === "'") inString = !inString;
    else if (!inString && char === "(") depth += 1;
    else if (!inString && char === ")") {
      depth -= 1;
      if (depth === 0) return statement.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced ${keyword} clause`);
}
