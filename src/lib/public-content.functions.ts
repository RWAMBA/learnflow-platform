/**
 * Stage 3 — anonymous published-content reads.
 *
 * These server functions are deliberately unauthenticated: they are called
 * from public route loaders during SSR and prerender, where no bearer token
 * exists. They read through the publishable-key client, so the `published`
 * RLS policies remain the only thing deciding what is visible; a draft or an
 * archived row is unreachable here even if a caller asks for it by slug.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const slugSchema = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120) });
const pageSchema = z.object({ pageSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64) });

export interface PublicContentBlock {
  id: string;
  contentKey: string;
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  displayOrder: number;
}

export const getPageContent = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => pageSchema.parse(input))
  .handler(async ({ data }): Promise<{ blocks: PublicContentBlock[]; fetchedAt: string }> => {
    const { publishableClient } = await import("./public-site.server");
    const { data: rows, error } = await publishableClient()
      .from("site_content")
      .select("id, content_key, title, summary, body_markdown, display_order")
      .eq("status", "published")
      .eq("page_slug", data.pageSlug)
      .order("display_order", { ascending: true });
    if (error) throw new Error("Content is unavailable right now.");
    return {
      blocks: (rows ?? []).map((r) => ({
        id: r.id,
        contentKey: r.content_key,
        title: r.title,
        summary: r.summary,
        bodyMarkdown: r.body_markdown,
        displayOrder: r.display_order,
      })),
      fetchedAt: new Date().toISOString(),
    };
  });

export const listGuideArticles = createServerFn({ method: "GET" }).handler(async () => {
  const { publishableClient } = await import("./public-site.server");
  const { data, error } = await publishableClient()
    .from("guide_articles")
    .select("id, slug, title, summary, category, tags, reading_minutes, published_at, display_order")
    .eq("status", "published")
    .order("display_order", { ascending: true })
    .order("published_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("The guide is unavailable right now.");
  return { articles: data ?? [], fetchedAt: new Date().toISOString() };
});

export const getGuideArticle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => slugSchema.parse(input))
  .handler(async ({ data }) => {
    const { publishableClient } = await import("./public-site.server");
    const { data: row, error } = await publishableClient()
      .from("guide_articles")
      .select(
        "id, slug, title, summary, body_markdown, category, tags, reading_minutes, seo_description, published_at",
      )
      .eq("status", "published")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error("The guide is unavailable right now.");
    return { article: row, fetchedAt: new Date().toISOString() };
  });

export const listTestimonials = createServerFn({ method: "GET" }).handler(async () => {
  const { publishableClient } = await import("./public-site.server");
  const { data, error } = await publishableClient()
    .from("testimonials")
    .select("id, author_name, author_role, author_location, quote, display_order")
    .eq("status", "published")
    .order("display_order", { ascending: true })
    .limit(200);
  if (error) throw new Error("Testimonials are unavailable right now.");
  return { testimonials: data ?? [], fetchedAt: new Date().toISOString() };
});

export const listFaqs = createServerFn({ method: "GET" }).handler(async () => {
  const { publishableClient } = await import("./public-site.server");
  const { data, error } = await publishableClient()
    .from("faqs")
    .select("id, question, answer_markdown, category, display_order")
    .eq("status", "published")
    .order("display_order", { ascending: true })
    .limit(300);
  if (error) throw new Error("FAQs are unavailable right now.");
  return { faqs: data ?? [], fetchedAt: new Date().toISOString() };
});

export const listMerchandise = createServerFn({ method: "GET" }).handler(async () => {
  const { publishableClient } = await import("./public-site.server");
  const { data, error } = await publishableClient()
    .from("merchandise_items")
    .select(
      "id, slug, name, summary, price_amount, price_currency, availability_note, display_order",
    )
    .eq("status", "published")
    .order("display_order", { ascending: true })
    .limit(200);
  if (error) throw new Error("Merchandise is unavailable right now.");
  return { items: data ?? [], fetchedAt: new Date().toISOString() };
});

export const getMerchandiseItem = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => slugSchema.parse(input))
  .handler(async ({ data }) => {
    const { publishableClient } = await import("./public-site.server");
    const { data: row, error } = await publishableClient()
      .from("merchandise_items")
      .select(
        "id, slug, name, summary, description_markdown, price_amount, price_currency, availability_note",
      )
      .eq("status", "published")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error("Merchandise is unavailable right now.");
    return { item: row, fetchedAt: new Date().toISOString() };
  });

/**
 * Public runtime configuration. Only non-secret values cross this boundary:
 * the Turnstile *site* key and booleans saying which journeys are configured.
 */
export const getPublicSiteConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { publicSiteConfigStatus } = await import("./public-site.server");
  const status = publicSiteConfigStatus();
  return {
    turnstileSiteKey: process.env["VITE_TURNSTILE_SITE_KEY"] ?? null,
    formsEnabled: status.turnstile && status.ipSalt && status.fingerprintSalt,
    newsletterEnabled:
      status.turnstile && status.ipSalt && status.fingerprintSalt && status.newsletterSalt,
    uploadsEnabled: status.malwareScanner,
  };
});
