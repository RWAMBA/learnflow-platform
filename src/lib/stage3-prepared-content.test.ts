/**
 * Stage 3 — the prepared publication packet must satisfy the same validation
 * the administrator's own submissions do, and must make no unsupported claim.
 */
import { describe, expect, it } from "vitest";
import { PREPARED_CONTENT } from "@/features/public-site/prepared-content";
import {
  faqInputSchema,
  guideArticleInputSchema,
  siteContentInputSchema,
} from "@/lib/public-site.schemas";

const SCHEMAS = {
  site_content: siteContentInputSchema,
  guide_articles: guideArticleInputSchema,
  faqs: faqInputSchema,
} as const;

/** Claims the owner has not evidenced and that must never be published. */
const FORBIDDEN =
  /\b(accredit\w*|certified|certification|qualification granted|guarantee\w*|partnership with|in partnership|our partners|students enrolled|learners enrolled|university|TVET|degree|diploma|scholarship)\b/i;

describe("prepared CMS packet", () => {
  it("covers only the entities the owner approved", () => {
    expect(Object.keys(PREPARED_CONTENT).sort()).toEqual([
      "faqs",
      "guide_articles",
      "site_content",
    ]);
    expect(PREPARED_CONTENT["testimonials"]).toBeUndefined();
    expect(PREPARED_CONTENT["merchandise_items"]).toBeUndefined();
  });

  for (const [table, schema] of Object.entries(SCHEMAS)) {
    const set = PREPARED_CONTENT[table as keyof typeof SCHEMAS]!;

    it(`${table}: every record parses against the server schema`, () => {
      for (const record of set.records) {
        expect(() => schema.parse(record.values), record.label).not.toThrow();
      }
    });

    it(`${table}: identities are unique and display order is deterministic`, () => {
      const ids = set.records.map((r) => String(r.values[set.identityKey]));
      expect(new Set(ids).size).toBe(ids.length);
      for (const record of set.records) {
        expect(typeof record.values["displayOrder"]).toBe("number");
      }
    });

    it(`${table}: makes no unsupported claim`, () => {
      for (const record of set.records) {
        const text = JSON.stringify(record.values);
        const match = text.match(FORBIDDEN);
        // Negations such as "does not issue certificates" are written without
        // the claim words, so any match is a real defect.
        expect(match?.[0], `${record.label}: ${match?.[0] ?? ""}`).toBeUndefined();
      }
    });
  }
});
