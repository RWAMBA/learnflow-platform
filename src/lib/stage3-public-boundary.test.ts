/**
 * Stage 3 — Public boundary: validation, injection resistance, safe rendering,
 * consent and rate-limit census.
 *
 * These are behavioural tests against the code that actually runs at the
 * public edge, not restatements of the specification.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SafeMarkdown } from "@/components/public/safe-markdown";
import { RATE_LIMITS, PUBLIC_ERROR, RETENTION_DAYS } from "@/lib/public-site.constants";
import {
  CMS_SORT_COLUMNS,
  CMS_TABLES,
  cmsListSchema,
  cmsReorderSchema,
  cmsSaveSchema,
  cmsStatusSchema,
  consultationInquirySchema,
  contactInquirySchema,
  emailSchema,
  faqInputSchema,
  guideArticleInputSchema,
  instructorApplicationSchema,
  merchandiseInputSchema,
  newsletterSubscribeSchema,
  newsletterTokenSchema,
  normalizeText,
  phoneSchema,
  siteContentInputSchema,
  uploadTicketSchema,
} from "@/lib/public-site.schemas";

const baseContact = {
  fullName: "Amina Otieno",
  email: "amina@example.com",
  subject: "Enrolment question",
  message: "We would like to understand how Grade 7 placement works for our daughter.",
  renderedAt: Date.now() - 10_000,
  website: "",
  turnstileToken: "t".repeat(20),
} as Record<string, unknown>;

describe("Stage 3 — input validation", () => {
  it("accepts a well-formed contact inquiry", () => {
    expect(contactInquirySchema.safeParse(baseContact).success).toBe(true);
  });

  it("rejects unknown fields rather than ignoring them", () => {
    const result = contactInquirySchema.safeParse({ ...baseContact, isAdmin: true });
    expect(result.success).toBe(false);
  });

  it("rejects malformed email addresses", () => {
    for (const bad of ["nobody", "a@b", "a b@example.com", "a@example", "@example.com"]) {
      expect(emailSchema.safeParse(bad).success).toBe(false);
    }
    expect(emailSchema.safeParse("parent+tag@example.co.ke").success).toBe(true);
  });

  it("requires E.164 phone numbers when a phone is given", () => {
    expect(phoneSchema.safeParse("+254712345678").success).toBe(true);
    for (const bad of ["0712345678", "+0712345678", "+2547123456789012345", "phone"]) {
      expect(phoneSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("normalizes Unicode compatibility forms and trims", () => {
    expect(normalizeText("Ame\u0301lie  ")).toContain("Amélie");
    expect(normalizeText("\uFF21\uFF22")).toBe("AB");
  });

  it("rejects control characters inside free text", () => {
    expect(
      contactInquirySchema.safeParse({ ...baseContact, subject: "Enrol\u0007ment" }).success,
    ).toBe(false);
    expect(emailSchema.safeParse("a\r\nbcc: victim@example.com@example.com").success).toBe(false);
  });

  it("enforces request and field bounds", () => {
    expect(
      contactInquirySchema.safeParse({ ...baseContact, message: "x".repeat(100_000) }).success,
    ).toBe(false);
    expect(contactInquirySchema.safeParse({ ...baseContact, message: "hi" }).success).toBe(false);
  });

  it("rejects a filled honeypot on every public form", () => {
    for (const schema of [contactInquirySchema, consultationInquirySchema]) {
      expect(schema.safeParse({ ...baseContact, website: "http://spam.example" }).success).toBe(
        false,
      );
    }
  });

  it("requires an anti-automation token and a render timestamp", () => {
    const { turnstileToken: _t, ...noToken } = baseContact;
    expect(contactInquirySchema.safeParse(noToken).success).toBe(false);
    const { renderedAt: _r, ...noStamp } = baseContact;
    expect(contactInquirySchema.safeParse(noStamp).success).toBe(false);
  });

  it("requires a complete consultation payload", () => {
    expect(consultationInquirySchema.safeParse(baseContact).success).toBe(false);
    expect(
      consultationInquirySchema.safeParse({
        ...baseContact,
        phone: "+254712345678",
        learnerCount: 2,
        preferredContact: "email",
        interest: "part_time",
        subject: undefined,
      }).success,
    ).toBe(false);
  });

  it("only accepts PDF and DOCX upload tickets within size limits", () => {
    const ok = {
      fileName: "cv.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      turnstileToken: "t".repeat(20),
    };
    expect(uploadTicketSchema.safeParse(ok).success).toBe(true);
    expect(uploadTicketSchema.safeParse({ ...ok, contentType: "image/svg+xml" }).success).toBe(
      false,
    );
    expect(uploadTicketSchema.safeParse({ ...ok, contentType: "text/html" }).success).toBe(false);
    expect(uploadTicketSchema.safeParse({ ...ok, sizeBytes: 50_000_000 }).success).toBe(false);
  });

  it("bounds newsletter tokens", () => {
    expect(newsletterTokenSchema.safeParse({ token: "" }).success).toBe(false);
    expect(newsletterTokenSchema.safeParse({ token: "a".repeat(4000) }).success).toBe(false);
  });
});

describe("Stage 3 — injection resistance", () => {
  const payloads = [
    "'; DROP TABLE public.site_content; --",
    "1 OR 1=1",
    "\\'; SELECT pg_sleep(10); --",
    "admin'/*",
  ];

  it("never lets a client choose a table name", () => {
    for (const payload of payloads) {
      expect(cmsListSchema.safeParse({ table: payload }).success).toBe(false);
    }
    for (const table of CMS_TABLES) {
      expect(cmsListSchema.safeParse({ table }).success).toBe(true);
    }
  });

  it("never lets a client choose a sort column or direction freely", () => {
    for (const payload of payloads) {
      expect(
        cmsListSchema.safeParse({
          table: "faqs",
          sort: { column: payload, ascending: true },
        }).success,
      ).toBe(false);
    }
    for (const column of CMS_SORT_COLUMNS) {
      expect(
        cmsListSchema.safeParse({ table: "faqs", sort: { column, ascending: false } }).success,
      ).toBe(true);
    }
  });

  it("treats injection strings in content as ordinary text", () => {
    const parsed = faqInputSchema.safeParse({
      question: payloads[0]!,
      answerMarkdown: payloads[1]!,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.question).toContain("DROP TABLE");
  });

  it("rejects non-UUID identifiers on every administrative mutation", () => {
    expect(
      cmsStatusSchema.safeParse({
        table: "faqs",
        id: "1 OR 1=1",
        expectedVersion: 1,
        status: "published",
      }).success,
    ).toBe(false);
    expect(
      cmsReorderSchema.safeParse({ table: "faqs", order: [{ id: "x", expectedVersion: 1 }] })
        .success,
    ).toBe(false);
  });
});

describe("Stage 3 — safe rendering", () => {
  const render = (source: string) => renderToStaticMarkup(createElement(SafeMarkdown, { source }));

  it("escapes stored HTML instead of executing it", () => {
    const html = render('<img src=x onerror="alert(1)"> <script>alert(2)</script>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    // The payload survives only as escaped text inside a paragraph.
    expect(html).toContain("&lt;script");
    expect(html).toContain("&lt;img");
  });

  it("drops javascript: and data: links but keeps the label", () => {
    const html = render("[click](javascript:alert(1)) and [x](data:text/html;base64,AAA)");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain("click");
  });

  it("marks external links noopener noreferrer nofollow", () => {
    const html = render("[site](https://example.com)");
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it("never emits raw markup for reflected query-style input", () => {
    const html = render('Results for "<svg/onload=alert(1)>"');
    expect(html).not.toContain("<svg");
  });

  it("renders headings and lists as elements, not markup passthrough", () => {
    const html = render("## Heading\n\n- one\n- two");
    expect(html).toContain("<h2");
    expect(html).toContain("<li>");
  });
});

describe("Stage 3 — administrative contracts", () => {
  it("requires a version on every destructive-by-overwrite operation", () => {
    expect(
      cmsStatusSchema.safeParse({
        table: "faqs",
        id: "11111111-1111-4111-8111-111111111111",
        status: "published",
      }).success,
    ).toBe(false);
  });

  it("bounds a reorder batch", () => {
    const item = { id: "11111111-1111-4111-8111-111111111111", expectedVersion: 1 };
    expect(cmsReorderSchema.safeParse({ table: "faqs", order: [] }).success).toBe(false);
    expect(
      cmsReorderSchema.safeParse({ table: "faqs", order: Array(500).fill(item) }).success,
    ).toBe(false);
    expect(cmsReorderSchema.safeParse({ table: "faqs", order: [item] }).success).toBe(true);
  });

  it("rejects unknown keys on a save envelope", () => {
    expect(cmsSaveSchema.safeParse({ table: "faqs", values: {}, elevate: true }).success).toBe(
      false,
    );
  });

  it("validates each entity payload strictly", () => {
    expect(
      siteContentInputSchema.safeParse({ contentKey: "A B", pageSlug: "x", title: "t" }).success,
    ).toBe(false);
    expect(
      guideArticleInputSchema.safeParse({
        slug: "getting-started",
        title: "Getting started",
        summary: "A short guide.",
        tags: Array(40).fill("tag"),
      }).success,
    ).toBe(false);
    expect(
      merchandiseInputSchema.safeParse({
        slug: "tote",
        name: "Tote",
        summary: "A tote bag.",
        priceAmount: 10,
      }).success,
    ).toBe(false);
  });
});

describe("Stage 3 — rate-limit census", () => {
  it("covers every approved candidate surface", () => {
    for (const purpose of [
      "health",
      "contact",
      "consultation",
      "merchandise",
      "instructor_application",
      "upload_ticket",
      "signed_download",
      "newsletter_subscribe",
      "newsletter_confirm",
      "newsletter_unsubscribe",
      "cms_mutation",
      "inquiry_admin_action",
      "relationship_invite",
      "messaging_send",
      "search",
      "assessment_analytics",
      "email_trigger",
    ]) {
      expect(RATE_LIMITS).toHaveProperty(purpose);
    }
  });

  it("keeps every window finite and every limit positive", () => {
    for (const [purpose, config] of Object.entries(RATE_LIMITS)) {
      expect(config.limit, purpose).toBeGreaterThan(0);
      expect(config.windowSeconds, purpose).toBeGreaterThan(0);
      expect(config.windowSeconds, purpose).toBeLessThanOrEqual(86_400);
    }
  });

  it("keeps sensitive submission surfaces tighter than reads", () => {
    expect(RATE_LIMITS.instructor_application.limit).toBeLessThan(RATE_LIMITS.health.limit);
    expect(RATE_LIMITS.contact.limit).toBeLessThan(RATE_LIMITS.search.limit);
  });

  it("exposes a stable machine-readable rate-limit code", () => {
    expect(PUBLIC_ERROR.rateLimited).toBe("RATE_LIMITED");
  });

  it("defines a finite retention period for every public submission type", () => {
    for (const [kind, days] of Object.entries(RETENTION_DAYS)) {
      expect(days, kind).toBeGreaterThan(0);
      expect(days, kind).toBeLessThanOrEqual(3650);
    }
  });
});
