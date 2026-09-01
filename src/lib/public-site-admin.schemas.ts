/**
 * Stage 3 — Platform Administration CMS contracts.
 *
 * Every schema is strict: unknown fields are rejected rather than silently
 * dropped, table names come from a fixed allowlist (no dynamic identifier can
 * reach SQL), and ordering is chosen from a closed set. Authority is never
 * asserted here — RLS decides it — these schemas only bound the request.
 */
import { z } from "zod";

export const CMS_TABLES = [
  "site_content",
  "guide_articles",
  "testimonials",
  "faqs",
  "merchandise_items",
] as const;
export type CmsTable = (typeof CMS_TABLES)[number];

export const cmsTableSchema = z.enum(CMS_TABLES);
export const contentStatusSchema = z.enum(["draft", "published", "archived"]);

const uuid = z.string().uuid();
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens.")
  .max(120);
const contentKey = z
  .string()
  .regex(/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/)
  .max(96);

/** Control characters (other than newline/tab) are never legitimate content. */
const clean = (max: number) =>
  z
    .string()
    .transform((v) => v.normalize("NFC"))
    .refine((v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v), {
      message: "Remove control characters.",
    })
    .pipe(z.string().max(max));

export const siteContentValues = z
  .object({
    contentKey,
    pageSlug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(64),
    title: clean(200).pipe(z.string().min(1)),
    summary: clean(500).nullish(),
    bodyMarkdown: clean(40000),
    displayOrder: z.number().int().min(0).max(100000),
  })
  .strict();

export const guideArticleValues = z
  .object({
    slug,
    title: clean(200).pipe(z.string().min(1)),
    summary: clean(500).pipe(z.string().min(1)),
    bodyMarkdown: clean(80000),
    category: clean(64).pipe(z.string().min(1)),
    tags: z.array(clean(32)).max(12).default([]),
    readingMinutes: z.number().int().min(1).max(240).nullish(),
    seoDescription: clean(300).nullish(),
    displayOrder: z.number().int().min(0).max(100000),
  })
  .strict();

export const testimonialValues = z
  .object({
    authorName: clean(120).pipe(z.string().min(1)),
    authorRole: clean(120).nullish(),
    authorLocation: clean(120).nullish(),
    quote: clean(2000).pipe(z.string().min(1)),
    displayOrder: z.number().int().min(0).max(100000),
  })
  .strict();

export const faqValues = z
  .object({
    question: clean(300).pipe(z.string().min(1)),
    answerMarkdown: clean(8000).pipe(z.string().min(1)),
    category: clean(64).pipe(z.string().min(1)),
    displayOrder: z.number().int().min(0).max(100000),
  })
  .strict();

export const merchandiseValues = z
  .object({
    slug,
    name: clean(200).pipe(z.string().min(1)),
    summary: clean(500).pipe(z.string().min(1)),
    descriptionMarkdown: clean(20000),
    priceAmount: z.number().min(0).max(1000000).nullish(),
    priceCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullish(),
    availabilityNote: clean(300).nullish(),
    displayOrder: z.number().int().min(0).max(100000),
  })
  .strict()
  .refine((v) => (v.priceAmount == null) === (v.priceCurrency == null), {
    message: "Provide both a price and a currency, or neither.",
    path: ["priceAmount"],
  });

export const saveContentSchema = z.discriminatedUnion("table", [
  z
    .object({
      table: z.literal("site_content"),
      id: uuid.nullish(),
      expectedUpdatedAt: z.string().datetime().nullish(),
      values: siteContentValues,
    })
    .strict(),
  z
    .object({
      table: z.literal("guide_articles"),
      id: uuid.nullish(),
      expectedUpdatedAt: z.string().datetime().nullish(),
      values: guideArticleValues,
    })
    .strict(),
  z
    .object({
      table: z.literal("testimonials"),
      id: uuid.nullish(),
      expectedUpdatedAt: z.string().datetime().nullish(),
      values: testimonialValues,
    })
    .strict(),
  z
    .object({
      table: z.literal("faqs"),
      id: uuid.nullish(),
      expectedUpdatedAt: z.string().datetime().nullish(),
      values: faqValues,
    })
    .strict(),
  z
    .object({
      table: z.literal("merchandise_items"),
      id: uuid.nullish(),
      expectedUpdatedAt: z.string().datetime().nullish(),
      values: merchandiseValues,
    })
    .strict(),
]);

export const setStatusSchema = z
  .object({
    table: cmsTableSchema,
    id: uuid,
    status: contentStatusSchema,
    expectedUpdatedAt: z.string().datetime(),
  })
  .strict();

export const reorderSchema = z
  .object({
    table: cmsTableSchema,
    items: z
      .array(z.object({ id: uuid, displayOrder: z.number().int().min(0).max(100000) }).strict())
      .min(1)
      .max(200),
  })
  .strict();

export const listContentSchema = z.object({ table: cmsTableSchema }).strict();

export const inquiryActionSchema = z
  .object({
    id: uuid,
    status: z.enum(["new", "in_review", "responded", "closed", "spam"]),
    handlingNote: clean(2000).nullish(),
  })
  .strict();

export const applicationActionSchema = z
  .object({
    id: uuid,
    applicationStatus: z.enum([
      "submitted",
      "screening",
      "interview",
      "accepted",
      "declined",
      "withdrawn",
    ]),
    decisionNote: clean(2000).nullish(),
  })
  .strict();

export const documentLinkSchema = z
  .object({ path: z.string().min(3).max(512) })
  .strict();

export type SaveContentInput = z.infer<typeof saveContentSchema>;
