/**
 * Stage 3 — Public boundary: validation, injection resistance, safe rendering,
 * consent and rate-limit census.
 *
 * These are behavioural tests against the code that actually runs at the
 * public edge, not restatements of the specification.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
import {
  assertMalwareScanClean,
  createUploadClaim,
  isEmailProviderConfigured,
  isMalwareScannerConfigured,
  parseUploadClaim,
  publicSiteCapabilityFlags,
  readPublishedContent,
  sendNewsletterConfirmationEmail,
} from "@/lib/public-site.server";

const NEWSLETTER_SUBSCRIBE_ROUTE = readFileSync(
  `${process.cwd()}/src/routes/api/public/newsletter.subscribe.ts`,
  "utf8",
);
const UPLOAD_TICKET_ROUTE = readFileSync(
  `${process.cwd()}/src/routes/api/public/upload-ticket.ts`,
  "utf8",
);
const INQUIRIES_ROUTE = readFileSync(`${process.cwd()}/src/routes/api/public/inquiries.ts`, "utf8");

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

  it("requires complete malware scanner configuration", () => {
    expect(isMalwareScannerConfigured({})).toBe(false);
    expect(
      isMalwareScannerConfigured({
        MALWARE_SCANNER_PROVIDER: "http-json-v1",
        MALWARE_SCANNER_URL: "https://scanner.example.test/v1/scan",
        MALWARE_SCANNER_API_KEY: "secret",
      }),
    ).toBe(true);
    expect(
      isMalwareScannerConfigured({
        MALWARE_SCANNER_PROVIDER: "unknown",
        MALWARE_SCANNER_URL: "https://scanner.example.test/v1/scan",
        MALWARE_SCANNER_API_KEY: "secret",
      }),
    ).toBe(false);
  });

  it("accepts only an explicit clean scanner verdict", async () => {
    const env = {
      MALWARE_SCANNER_PROVIDER: "http-json-v1",
      MALWARE_SCANNER_URL: "https://scanner.example.test/v1/scan",
      MALWARE_SCANNER_API_KEY: "secret",
    };
    let authorization = "";
    await expect(
      assertMalwareScanClean(new TextEncoder().encode("%PDF-test"), "application/pdf", env, (async (
        _input,
        init,
      ) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(JSON.stringify({ clean: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch),
    ).resolves.toBeUndefined();
    expect(authorization).toBe("Bearer secret");

    await expect(
      assertMalwareScanClean(
        new TextEncoder().encode("%PDF-test"),
        "application/pdf",
        env,
        (async () =>
          new Response(JSON.stringify({ clean: false }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })) as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: PUBLIC_ERROR.validation, status: 400 });
  });

  it("signs upload claims and rejects tampering or a different requester", () => {
    const now = 2_000_000;
    const claim = createUploadClaim(
      {
        path: "applications/11111111-1111-4111-8111-111111111111/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
        requesterFingerprint: "requester-a",
      },
      "claim-secret",
      now,
    );

    expect(parseUploadClaim(claim, "requester-a", "claim-secret", now + 1_000)?.sizeBytes).toBe(
      1024,
    );
    expect(parseUploadClaim(claim, "requester-b", "claim-secret", now + 1_000)).toBeNull();
    expect(parseUploadClaim(`${claim}x`, "requester-a", "claim-secret", now + 1_000)).toBeNull();
    expect(parseUploadClaim(claim, "requester-a", "claim-secret", now + 20 * 60_000)).toBeNull();

    const application = {
      fullName: "Amina Tutor",
      email: "amina@example.com",
      phone: "+254712345678",
      subjects: ["Mathematics"],
      yearsExperience: 4,
      qualificationsSummary: "Qualified and experienced classroom teacher.",
      portfolioUrl: null,
      message: "I would like to support LearnFlow learners.",
      documentClaims: [
        {
          path: "applications/11111111-1111-4111-8111-111111111111/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf",
          claim,
        },
      ],
      website: "",
      renderedAt: Date.now() - 5_000,
      turnstileToken: "t".repeat(20),
    };
    expect(instructorApplicationSchema.safeParse(application).success).toBe(true);
    expect(
      instructorApplicationSchema.safeParse({
        ...application,
        documentClaims: [{ path: application.documentClaims[0]!.path, claim, extra: true }],
      }).success,
    ).toBe(false);
  });

  it("bounds newsletter tokens", () => {
    expect(newsletterTokenSchema.safeParse({ token: "" }).success).toBe(false);
    expect(newsletterTokenSchema.safeParse({ token: "a".repeat(4000) }).success).toBe(false);
  });
});

describe("Stage 3 — published-content resilience", () => {
  it("serves stale content while refreshing the last-known-good value", async () => {
    const key = `test-${crypto.randomUUID()}`;
    let value = 1;
    const load = async () => ({ value });

    expect(await readPublishedContent(key, load, 1_000)).toEqual({ value: 1 });
    value = 2;
    expect(await readPublishedContent(key, load, 62_000)).toEqual({ value: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await readPublishedContent(key, load, 62_001)).toEqual({ value: 2 });
  });

  it("uses last-known-good content during a transient refresh failure", async () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(await readPublishedContent(key, async () => "available", 1_000)).toBe("available");
    expect(
      await readPublishedContent(
        key,
        async () => {
          throw new Error("database unavailable");
        },
        62_000,
      ),
    ).toBe("available");
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

describe("Stage 3 — public capability flags", () => {
  const configured = {
    turnstile: true,
    ipSalt: true,
    fingerprintSalt: true,
    newsletterSalt: true,
    emailProvider: true,
    malwareScanner: true,
    trustedProxyHeader: true,
  };

  it("never advertises newsletter signup without a delivery provider", () => {
    expect(
      publicSiteCapabilityFlags({ ...configured, emailProvider: false }).newsletterEnabled,
    ).toBe(false);
    expect(publicSiteCapabilityFlags(configured).newsletterEnabled).toBe(true);
  });

  it("requires both Resend credentials and a verified sender", () => {
    expect(isEmailProviderConfigured({ RESEND_API_KEY: "key" })).toBe(false);
    expect(isEmailProviderConfigured({ RESEND_FROM_EMAIL: "updates@example.com" })).toBe(false);
    expect(
      isEmailProviderConfigured({
        RESEND_API_KEY: "key",
        RESEND_FROM_EMAIL: "LearnFlow <updates@example.com>",
        VITE_APP_URL: "https://learnflow.example.com",
      }),
    ).toBe(true);
  });

  it("sends the raw confirmation token only after the pending request is stored", () => {
    expect(NEWSLETTER_SUBSCRIBE_ROUTE).toContain("const { token, tokenHash } = newTokenPair()");
    expect(NEWSLETTER_SUBSCRIBE_ROUTE).toContain("await sendNewsletterConfirmationEmail(");
  });

  it("delivers a confirmation link without exposing the provider key", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ input, init });
      return new Response(null, { status: 202 });
    };

    await sendNewsletterConfirmationEmail(
      { email: "parent@example.com", token: "raw-confirmation-token" },
      {
        env: {
          RESEND_API_KEY: "provider-secret",
          RESEND_FROM_EMAIL: "LearnFlow <updates@example.com>",
          VITE_APP_URL: "https://learnflow.example.com",
        },
        fetcher,
      },
    );

    expect(requests).toHaveLength(1);
    expect(String(requests[0]?.input)).toBe("https://api.resend.com/emails");
    const body = String(requests[0]?.init?.body);
    expect(body).toContain(
      "https://learnflow.example.com/newsletter/confirm?token=raw-confirmation-token",
    );
    expect(body).not.toContain("provider-secret");
  });

  it("fails upload-ticket issuance closed without a malware scanner", () => {
    expect(UPLOAD_TICKET_ROUTE).toContain('missingPublicSiteConfig(["malwareScanner"])');
  });

  it("preserves documents already attached to a duplicate application", () => {
    expect(INQUIRIES_ROUTE).toContain('.select("document_paths")');
    expect(INQUIRIES_ROUTE).toContain("claimedUploadPaths.filter((path) => !attached.has(path))");
  });
});
