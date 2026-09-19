/** TEMPORARY — tests for the Stage 3 Markdown remediation helper. */
import { describe, expect, it } from "vitest";
import { evaluateBody, formatBody, plaintext } from "@/features/public-site/markdown-format";

const LIST = [
  "Explore published options. Review the curricula and programmes currently available.",
  "Request guidance. Submit a consultation request if you need help.",
].join("\n");

describe("markdown remediation helper", () => {
  it("turns single-newline blocks into a list and bolds existing labels", () => {
    const out = formatBody(LIST);
    expect(out).toBe(
      [
        "- **Explore published options.** Review the curricula and programmes currently available.",
        "- **Request guidance.** Submit a consultation request if you need help.",
      ].join("\n"),
    );
  });

  it("preserves plaintext equivalence", () => {
    expect(plaintext(formatBody(LIST))).toBe(plaintext(LIST));
  });

  it("normalises legacy asterisk bullets without changing wording", () => {
    const original = "* First belief.\n* Second belief.";
    const out = evaluateBody(original);
    expect(out.proposed).toBe("- First belief.\n- Second belief.");
    expect(out.equivalent).toBe(true);
  });

  it("skips fields that already contain Markdown", () => {
    const original = "## Heading\n\nSome prose.";
    const out = evaluateBody(original);
    expect(out.skipped).toBe(true);
    expect(out.proposed).toBe(original);
  });

  it("leaves prose paragraphs untouched", () => {
    const original = "One paragraph.\n\nAnother paragraph with detail.";
    expect(evaluateBody(original).changed).toBe(false);
  });

  it("is idempotent", () => {
    const once = formatBody(LIST);
    expect(evaluateBody(once).changed).toBe(false);
  });
});
