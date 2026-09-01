/**
 * Stage 3 — Platform Administration CMS server functions.
 *
 * Authority is never decided in this file. Every call runs through
 * `requireSupabaseAuth` and then queries with the caller's own Supabase
 * client, so the `app_private.is_platform_admin()` RLS policies are the only
 * thing that permits a read or a write. A deactivated administrator therefore
 * loses access the moment their platform_admins row stops qualifying, with no
 * application change.
 *
 * Writes are optimistic-concurrency guarded on `updated_at`: a stale editor
 * gets a conflict rather than silently overwriting someone else's edit.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applicationActionSchema,
  documentLinkSchema,
  inquiryActionSchema,
  listContentSchema,
  reorderSchema,
  saveContentSchema,
  setStatusSchema,
  type CmsTable,
  type SaveContentInput,
} from "./public-site-admin.schemas";

export class ContentConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  constructor() {
    super("This item changed since you opened it. Reload to see the current version.");
    this.name = "ContentConflictError";
  }
}

const SELECT_COLUMNS: Record<CmsTable, string> = {
  site_content:
    "id, content_key, page_slug, title, summary, body_markdown, status, display_order, content_version, published_at, archived_at, updated_at, updated_by",
  guide_articles:
    "id, slug, title, summary, body_markdown, category, tags, reading_minutes, seo_description, status, display_order, content_version, published_at, archived_at, updated_at, updated_by",
  testimonials:
    "id, author_name, author_role, author_location, quote, status, display_order, content_version, published_at, archived_at, updated_at, updated_by",
  faqs: "id, question, answer_markdown, category, status, display_order, content_version, published_at, archived_at, updated_at, updated_by",
  merchandise_items:
    "id, slug, name, summary, description_markdown, price_amount, price_currency, availability_note, status, display_order, content_version, published_at, archived_at, updated_at, updated_by",
};

/** Values are mapped explicitly; no client-supplied key ever reaches a column. */
function toRow(input: SaveContentInput): Record<string, unknown> {
  switch (input.table) {
    case "site_content":
      return {
        content_key: input.values.contentKey,
        page_slug: input.values.pageSlug,
        title: input.values.title,
        summary: input.values.summary ?? null,
        body_markdown: input.values.bodyMarkdown,
        display_order: input.values.displayOrder,
      };
    case "guide_articles":
      return {
        slug: input.values.slug,
        title: input.values.title,
        summary: input.values.summary,
        body_markdown: input.values.bodyMarkdown,
        category: input.values.category,
        tags: input.values.tags,
        reading_minutes: input.values.readingMinutes ?? null,
        seo_description: input.values.seoDescription ?? null,
        display_order: input.values.displayOrder,
      };
    case "testimonials":
      return {
        author_name: input.values.authorName,
        author_role: input.values.authorRole ?? null,
        author_location: input.values.authorLocation ?? null,
        quote: input.values.quote,
        display_order: input.values.displayOrder,
      };
    case "faqs":
      return {
        question: input.values.question,
        answer_markdown: input.values.answerMarkdown,
        category: input.values.category,
        display_order: input.values.displayOrder,
      };
    case "merchandise_items":
      return {
        slug: input.values.slug,
        name: input.values.name,
        summary: input.values.summary,
        description_markdown: input.values.descriptionMarkdown,
        price_amount: input.values.priceAmount ?? null,
        price_currency: input.values.priceCurrency ?? null,
        availability_note: input.values.availabilityNote ?? null,
        display_order: input.values.displayOrder,
      };
  }
}

async function limitAdmin(purpose: "cms_mutation" | "inquiry_admin_action", userId: string) {
  const { enforceRateLimit } = await import("./public-site.server");
  // Bucket key is derived server-side from the authenticated subject only.
  await enforceRateLimit(purpose, `user:${userId}`);
}

export const adminListContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listContentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from(data.table)
      .select(SELECT_COLUMNS[data.table])
      .order("display_order", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Content could not be loaded.");
    return { rows: (rows ?? []) as unknown as CmsRow[] };
  });

export const adminSaveContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveContentSchema.parse(input))
  .handler(async ({ data, context }) => {
    await limitAdmin("cms_mutation", context.userId);
    const row = { ...toRow(data), updated_by: context.userId };

    if (!data.id) {
      const { data: created, error } = await context.supabase
        .from(data.table)
        .insert({ ...row, created_by: context.userId } as never)
        .select("id, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return created;
    }

    if (!data.expectedUpdatedAt) throw new ContentConflictError();
    const { data: updated, error } = await context.supabase
      .from(data.table)
      .update(row as never)
      .eq("id", data.id)
      .eq("updated_at", data.expectedUpdatedAt)
      .select("id, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new ContentConflictError();
    return updated;
  });

export const adminSetContentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await limitAdmin("cms_mutation", context.userId);
    const { data: updated, error } = await context.supabase
      .from(data.table)
      .update({ status: data.status, updated_by: context.userId } as never)
      .eq("id", data.id)
      .eq("updated_at", data.expectedUpdatedAt)
      .select("id, status, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new ContentConflictError();
    return updated;
  });

/**
 * Ordering is the single optimistic surface in Stage 3: it is reversible,
 * carries no personal data and never publishes anything. The canonical order
 * is re-read afterwards so the client reconciles rather than trusts itself.
 */
export const adminReorderContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reorderSchema.parse(input))
  .handler(async ({ data, context }) => {
    await limitAdmin("cms_mutation", context.userId);
    for (const item of data.items) {
      const { error } = await context.supabase
        .from(data.table)
        .update({ display_order: item.displayOrder, updated_by: context.userId } as never)
        .eq("id", item.id);
      if (error) throw new Error(error.message);
    }
    const { data: rows, error } = await context.supabase
      .from(data.table)
      .select("id, display_order")
      .order("display_order", { ascending: true })
      .limit(500);
    if (error) throw new Error("Order could not be confirmed.");
    return { order: rows ?? [] };
  });

export const adminListInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("public_inquiries")
      .select(
        "id, inquiry_type, full_name, email, phone, subject, message, status, handling_note, handled_at, created_at, retention_expires_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Inquiries could not be loaded.");
    return { rows: data ?? [] };
  });

export const adminUpdateInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inquiryActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await limitAdmin("inquiry_admin_action", context.userId);
    const { data: updated, error } = await context.supabase
      .from("public_inquiries")
      .update({ status: data.status, handling_note: data.handlingNote ?? null })
      .eq("id", data.id)
      .select("id, status, handled_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("That inquiry is no longer available.");
    return updated;
  });

export const adminListApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("instructor_application_details")
      .select(
        "id, inquiry_id, subjects, qualifications_summary, years_experience, document_paths, malware_state, application_status, decision_note, decided_at, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Applications could not be loaded.");
    return { rows: data ?? [] };
  });

export const adminUpdateApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => applicationActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await limitAdmin("inquiry_admin_action", context.userId);
    const { data: updated, error } = await context.supabase
      .from("instructor_application_details")
      .update({
        application_status: data.applicationStatus,
        decision_note: data.decisionNote ?? null,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("id, application_status, decided_at, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("That application is no longer available.");
    return updated;
  });

/**
 * Signed, short-lived, attachment-only access to a recruitment document.
 *
 * Authorization is re-derived, not trusted: the path must belong to a stored
 * application row, and the signature is produced with the caller's own client
 * so the Storage policy re-checks platform-administrator status.
 */
export const adminCreateDocumentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => documentLinkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./public-site.server");
    await enforceRateLimit("signed_download", `user:${context.userId}`);

    const { data: owner, error: ownerError } = await context.supabase
      .from("instructor_application_details")
      .select("id, malware_state")
      .contains("document_paths", [data.path])
      .maybeSingle();
    if (ownerError) throw new Error("That document could not be verified.");
    if (!owner) throw new Error("That document is not available.");
    if (owner.malware_state !== "clean") {
      throw new Error("That document is quarantined pending a malware scan.");
    }

    const { data: signed, error } = await context.supabase.storage
      .from("instructor-applications")
      .createSignedUrl(data.path, 120, { download: true });
    if (error || !signed) throw new Error("That document is not available.");
    return { url: signed.signedUrl, expiresInSeconds: 120 };
  });

export const adminListNewsletter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("newsletter_subscriptions")
      .select(
        "id, email_normalized, state, confirmed_at, unsubscribed_at, suppressed_at, suppression_reason, consent_text_version, policy_version, retention_expires_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Newsletter state could not be loaded.");
    return { rows: data ?? [] };
  });

export const adminListSiteAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("public_site_audit_log")
      .select("id, entity_type, entity_id, action, actor_id, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Audit history could not be loaded.");
    return { rows: data ?? [] };
  });
