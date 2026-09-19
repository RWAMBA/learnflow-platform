/**
 * TEMPORARY — Stage 3 Markdown remediation helper.
 *
 * Pure, deterministic structural formatting for CMS body fields. It adds only
 * Markdown control syntax (list markers, bold markers around existing label
 * text) and Markdown-required whitespace. It never adds, removes, reorders or
 * rewrites words, numbers or punctuation.
 *
 * Remove this module together with the temporary administration button once
 * the remediation has been saved and verified.
 */

/** A field is treated as already formatted when it carries Markdown structure. */
export function hasExistingMarkdown(text: string): boolean {
  return text
    .split("\n")
    .some((line) => /^\s{0,3}#{1,6}\s/.test(line) || /^\s{0,3}-\s/.test(line) || /\*\*/.test(line));
}

const LABEL_COLON = /^([A-Z][^:\n]{2,70}):\s+(\S.*)$/;
const LABEL_PERIOD = /^([A-Z][^.\n]{2,70})\.\s+(\S.*)$/;

function wordCount(value: string): number {
  return value.trim().split(/\s+/).length;
}

/** Bolds an existing leading label inside a list item. Never edits wording. */
function boldLabel(line: string): string {
  const colon = LABEL_COLON.exec(line);
  if (colon && wordCount(colon[1]!) <= 7) return `**${colon[1]}**: ${colon[2]}`;
  const period = LABEL_PERIOD.exec(line);
  if (period && wordCount(period[1]!) <= 5) return `**${period[1]}.** ${period[2]}`;
  return line;
}

/**
 * Structural formatting:
 * - blocks of two or more single-newline lines become a `-` unordered list;
 * - legacy `*` bullets are normalised to `-`;
 * - an existing leading label inside a list item is wrapped in `**`;
 * - single-line and prose blocks are left exactly as they are.
 */
export function formatBody(original: string): string {
  const text = original.replace(/\r\n/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const formatted = blocks.map((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length < 2) return block.trim();
    const items = lines.map((line) => line.replace(/^[*-]\s+/, ""));
    return items.map((item) => `- ${boldLabel(item)}`).join("\n");
  });
  return formatted.filter((block) => block.length > 0).join("\n\n");
}

/** Plaintext projection used for the equivalence check (markers removed). */
export function plaintext(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\*\*/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)]|#{1,6})\s+/, "").trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface FormatOutcome {
  original: string;
  proposed: string;
  changed: boolean;
  skipped: boolean;
  skipReason?: string;
  equivalent: boolean;
  addedSyntax: string[];
}

/** Describes the Markdown symbols introduced, for the dry-run preview. */
function describeAdded(original: string, proposed: string): string[] {
  const added: string[] = [];
  const bullets = proposed.split("\n").filter((l) => l.startsWith("- ")).length;
  const originalBullets = original.split("\n").filter((l) => /^\s*[-*]\s/.test(l)).length;
  if (bullets > 0) {
    added.push(
      originalBullets > 0
        ? `${bullets} list marker(s) "- " (normalised from "*")`
        : `${bullets} list marker(s) "- "`,
    );
  }
  const bolds = (proposed.match(/\*\*/g) ?? []).length / 2;
  if (bolds > 0) added.push(`${bolds} bold pair(s) "**" around existing label text`);
  if (proposed.includes("\n\n") && !original.includes("\n\n")) added.push("Markdown blank line(s)");
  return added;
}

export function evaluateBody(original: string): FormatOutcome {
  if (!original.trim()) {
    return {
      original,
      proposed: original,
      changed: false,
      skipped: true,
      skipReason: "Empty field",
      equivalent: true,
      addedSyntax: [],
    };
  }
  if (hasExistingMarkdown(original)) {
    return {
      original,
      proposed: original,
      changed: false,
      skipped: true,
      skipReason: "Already valid Markdown",
      equivalent: true,
      addedSyntax: [],
    };
  }
  const proposed = formatBody(original);
  const changed = proposed !== original;
  return {
    original,
    proposed,
    changed,
    skipped: !changed,
    ...(changed ? {} : { skipReason: "No structure to add" }),
    equivalent: plaintext(proposed) === plaintext(original),
    addedSyntax: changed ? describeAdded(original, proposed) : [],
  };
}
