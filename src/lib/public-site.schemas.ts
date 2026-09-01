/**
 * Stage 3 — authoritative server-side validation.
 *
 * These schemas are the second of three layers (client UX, server, database).
 * Every object is strict: an unknown field is a rejection, not a silent drop.
 * Text is NFKC-normalised and control characters are refused so nothing can
 * smuggle an email header, a terminal escape or a zero-width homoglyph.
 */
import { z } from "zod";

/** C0/C1 controls except tab and newline, plus line/paragraph separators. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/;

export function normalizeText(value: string): string {
  return value.normalize("NFKC").trim();
}

const safeText = (min: number, max: number) =>
  z
    .string()
    .transform(normalizeText)
    .refine((v) => !CONTROL_CHARS.test(v), { message: "Contains characters that are not allowed" })
    .refine((v) => v.length >= min && v.length <= max, {
      message: `Must be between ${min} and ${max} characters`,
    });

/** Email headers are fixed server-side; a newline in an address is an attack. */
export const emailSchema = z
  .string()
  .transform((v) => normalizeText(v).toLowerCase())
  .refine((v) => v.length <= 254, { message: "Email is too long" })
  .refine((v) => !/[\r\n]/.test(v), { message: "Email is not valid" })
  .refine((v) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v), { message: "Enter a valid email address" });

/** E.164 only: a leading +, a non-zero country digit, 8–15 digits total. */
export const phoneSchema = z
  .string()
  .transform((v) => normalizeText(v).replace(/[\s()-]/g, ""))
  .refine((v) => /^\+[1-9][0-9]{7,14}$/.test(v), {
    message: "Enter a phone number in international format, for example +254712345678",
  });

export const httpsUrlSchema = z
  .string()
  .transform(normalizeText)
  .refine((v) => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, { message: "Enter a valid https:// address" });

/** Anti-automation envelope carried by every public form. */
const botShield = {
  turnstileToken: z.string().min(1).max(4096),
  /** Honeypot: must stay empty. */
  website: z.string().max(0).optional().default(""),
  /** Client render timestamp; server rejects impossibly fast submissions. */
  renderedAt: z.number().int().positive(),
};

export const contactInquirySchema = z
  .object({
    fullName: safeText(2, 160),
    email: emailSchema,
    phone: phoneSchema.optional().nullable(),
    subject: safeText(1, 200),
    message: safeText(10, 5000),
    ...botShield,
  })
  .strict();

export const consultationInquirySchema = z
  .object({
    fullName: safeText(2, 160),
    email: emailSchema,
    phone: phoneSchema,
    learnerCount: z.number().int().min(1).max(20),
    preferredContact: z.enum(["email", "phone"]),
    interest: z.enum(["full_time", "part_time", "undecided"]),
    message: safeText(10, 5000),
    ...botShield,
  })
  .strict();

export const merchandiseInquirySchema = z
  .object({
    fullName: safeText(2, 160),
    email: emailSchema,
    phone: phoneSchema.optional().nullable(),
    merchandiseId: z.string().uuid(),
    quantity: z.number().int().min(1).max(500),
    message: safeText(10, 5000),
    ...botShield,
  })
  .strict();

export const instructorApplicationSchema = z
  .object({
    fullName: safeText(2, 160),
    email: emailSchema,
    phone: phoneSchema,
    subjects: z.array(safeText(1, 80)).min(1).max(10),
    yearsExperience: z.number().int().min(0).max(60),
    qualificationsSummary: safeText(10, 4000),
    portfolioUrl: httpsUrlSchema.optional().nullable(),
    message: safeText(10, 5000),
    /** Server-generated upload paths returned by the upload-ticket endpoint. */
    documentPaths: z
      .array(z.string().regex(/^applications\/[0-9a-f-]{36}\/[a-z0-9]{32}\.(pdf|docx)$/))
      .max(3)
      .default([]),
    ...botShield,
  })
  .strict();

export const newsletterSubscribeSchema = z
  .object({
    email: emailSchema,
    consent: z.literal(true),
    ...botShield,
  })
  .strict();

export const newsletterTokenSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/) })
  .strict();

export const uploadTicketSchema = z
  .object({
    fileName: safeText(1, 200),
    contentType: z.enum([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024),
    turnstileToken: z.string().min(1).max(4096),
  })
  .strict();

/* ---------------- Platform Administration CMS ---------------- */

const contentStatus = z.enum(["draft", "published", "archived"]);

export const CMS_TABLES = [
  "site_content",
  "guide_articles",
  "testimonials",
  "faqs",
  "merchandise_items",
] as const;
export type CmsTable = (typeof CMS_TABLES)[number];

/** Fixed allowlist: a client may never choose a table or column name freely. */
export const cmsTableSchema = z.enum(CMS_TABLES);

export const CMS_SORT_COLUMNS = ["display_order", "updated_at", "created_at", "status"] as const;
export const cmsSortSchema = z
  .object({
    column: z.enum(CMS_SORT_COLUMNS).default("display_order"),
    ascending: z.boolean().default(true),
  })
  .strict();

export const cmsListSchema = z
  .object({
    table: cmsTableSchema,
    status: contentStatus.optional(),
    search: safeText(0, 120).optional(),
    sort: cmsSortSchema.optional(),
  })
  .strict();

export const siteContentInputSchema = z
  .object({
    contentKey: z
      .string()
      .transform(normalizeText)
      .refine((v) => /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/.test(v) && v.length <= 96, {
        message: "Use lowercase letters, numbers and separators only",
      }),
    pageSlug: z
      .string()
      .transform(normalizeText)
      .refine((v) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 64, {
        message: "Use a lowercase hyphenated slug",
      }),
    title: safeText(1, 200),
    summary: safeText(0, 500).optional().nullable(),
    bodyMarkdown: safeText(0, 40000).default(""),
    displayOrder: z.number().int().min(0).max(100000).default(0),
  })
  .strict();

export const guideArticleInputSchema = z
  .object({
    slug: z
      .string()
      .transform(normalizeText)
      .refine((v) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 120, {
        message: "Use a lowercase hyphenated slug",
      }),
    title: safeText(1, 200),
    summary: safeText(1, 500),
    bodyMarkdown: safeText(0, 80000).default(""),
    category: safeText(1, 64).default("general"),
    tags: z.array(safeText(1, 40)).max(12).default([]),
    readingMinutes: z.number().int().min(1).max(240).optional().nullable(),
    seoDescription: safeText(0, 300).optional().nullable(),
    displayOrder: z.number().int().min(0).max(100000).default(0),
  })
  .strict();

export const testimonialInputSchema = z
  .object({
    authorName: safeText(1, 120),
    authorRole: safeText(0, 120).optional().nullable(),
    authorLocation: safeText(0, 120).optional().nullable(),
    quote: safeText(1, 2000),
    displayOrder: z.number().int().min(0).max(100000).default(0),
  })
  .strict();

export const faqInputSchema = z
  .object({
    question: safeText(1, 300),
    answerMarkdown: safeText(1, 8000),
    category: safeText(1, 64).default("general"),
    displayOrder: z.number().int().min(0).max(100000).default(0),
  })
  .strict();

export const merchandiseInputSchema = z
  .object({
    slug: z
      .string()
      .transform(normalizeText)
      .refine((v) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 120, {
        message: "Use a lowercase hyphenated slug",
      }),
    name: safeText(1, 200),
    summary: safeText(1, 500),
    descriptionMarkdown: safeText(0, 20000).default(""),
    priceAmount: z.number().min(0).max(1000000).optional().nullable(),
    priceCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional()
      .nullable(),
    availabilityNote: safeText(0, 300).optional().nullable(),
    displayOrder: z.number().int().min(0).max(100000).default(0),
  })
  .strict()
  .refine((v) => (v.priceAmount == null) === (v.priceCurrency == null), {
    message: "Provide both a price and a currency, or neither",
    path: ["priceCurrency"],
  });

export const cmsSaveSchema = z
  .object({
    table: cmsTableSchema,
    id: z.string().uuid().optional(),
    expectedVersion: z.number().int().min(1).optional(),
    values: z.record(z.string(), z.unknown()),
  })
  .strict();

export const cmsStatusSchema = z
  .object({
    table: cmsTableSchema,
    id: z.string().uuid(),
    expectedVersion: z.number().int().min(1),
    status: contentStatus,
  })
  .strict();

export const cmsReorderSchema = z
  .object({
    table: cmsTableSchema,
    order: z
      .array(z.object({ id: z.string().uuid(), expectedVersion: z.number().int().min(1) }).strict())
      .min(1)
      .max(200),
  })
  .strict();

export const inquiryStatusSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["new", "in_review", "responded", "closed", "spam"]),
    note: safeText(0, 2000).optional().nullable(),
  })
  .strict();

export const applicationDecisionSchema = z
  .object({
    id: z.string().uuid(),
    applicationStatus: z.enum(["screening", "interview", "accepted", "declined", "withdrawn"]),
    note: safeText(0, 2000).optional().nullable(),
  })
  .strict();

export const signedDocumentSchema = z
  .object({ applicationId: z.string().uuid(), path: z.string().min(1).max(512) })
  .strict();

export const newsletterAdminSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["suppress", "unsuppress"]),
    reason: safeText(0, 200).optional().nullable(),
  })
  .strict();
