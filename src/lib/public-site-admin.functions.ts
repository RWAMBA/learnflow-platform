/**
 * Stage 3 — Platform Administration CMS server functions.
 *
 * Authority is never decided here. Every call runs through
 * `requireSupabaseAuth` and then queries with the caller's own Supabase
 * client, so the `app_private.is_platform_admin()` RLS policies are the only
 * thing that permits a read or a write: a deactivated administrator loses
 * access with no application change, and an identifier supplied by the client
 * cannot widen what the caller may touch.
 *
 * Writes carry the `content_version` the editor read. The database lifecycle
 * trigger raises a serialization conflict when that version is stale, so two
 * administrators can never silently overwrite each other.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applicationDecisionSchema,
  cmsListSchema,
  cmsReorderSchema,
  cmsSaveSchema,
  cmsStatusSchema,
  faqInputSchema,
  guideArticleInputSchema,
  inquiryStatusSchema,
  merchandiseInputSchema,
  siteContentInputSchema,
  signedDocumentSchema,
  testimonialInputSchema,
  type CmsTable,
} from "./public-site.schemas";

/** Serializable shape of a CMS row crossing the server boundary. */
export type CmsRow = Record<string, string | number | boolean | null | string[]>;

export const CONTENT_CONFLICT = "VERSION_CONFLICT";

function conflict(): Error {
  const error = new Error(
    "This item changed since you opened it. Reload to see the current version.",
  );
  error.name = CONTENT_CONFLICT;
  return error;
}

function isConflict(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "40001" || /CONFLICT:/.test(error.message ?? "")));
}

const SELECT_COLUMNS: Record<CmsTable, string> = {
  site_content:
    "id, content_key, page_slug, title, summary, body_markdown, status, display_order, content_version, published_at, archived_at, updated_at",
  guide_articles:
    "id, slug, title, summary, body_markdown, category, tags, reading_minutes, seo_description, status, display_order, content_version, published_at, archived_at, updated_at",
  testimonials:
    "id, author_name, author_role, author_location, quote, status, display_order, content_version, published_at, archived_at, updated_at",
  faqs: "id, question, answer_markdown, category, status, display_order, content_version, published_at, archived_at, updated_at",
  merchandise_items:
    "id, slug, name, summary, description_markdown, price_amount, price_currency, availability_note, status, display_order, content_version, published_at, archived_at, updated_at",
};

/**
 * Values are validated per entity and then mapped explicitly onto columns:
 * no client-supplied key ever reaches SQL, and no unknown field survives.
 */
function toRow(table: CmsTable, raw: Record<string, unknown>): Record<string, unknown> {
  switch (table) {
    case "site_content": {
      const v = siteContentInputSchema.parse(raw);
      return {
        content_key: v.contentKey,
        page_slug: v.pageSlug,
        title: v.title,
        summary: v.summary ?? null,
        body_markdown: v.bodyMarkdown,
        display_order: v.displayOrder,
      };
    }
    case "guide_articles": {
      const v = guideArticleInputSchema.parse(raw);
      return {
        slug: v.slug,
        title: v.title,
        summary: v.summary,
        body_markdown: v.bodyMarkdown,
        category: v.category,
        tags: v.tags,
        reading_minutes: v.readingMinutes ?? null,
        seo_description: v.seoDescription ?? null,
        display_order: v.displayOrder,
      };
    }
    case "testimonials": {
      const v = testimonialInputSchema.parse(raw);
      return {
        author_name: v.authorName,
        author_role: v.authorRole ?? null,
        author_location: v.authorLocation ?? null,
        quote: v.quote,
        display_order: v.displayOrder,
      };
    }
    case "faqs": {
      const v = faqInputSchema.parse(raw);
      return {
        question: v.question,
        answer_markdown: v.answerMarkdown,
        category: v.category,
        display_order: v.displayOrder,
      };
    }
    case "merchandise_items": {
      const v = merchandiseInputSchema.parse(raw);
      return {
        slug: v.slug,
        name: v.name,
        summary: v.summary,
        description_markdown: v.descriptionMarkdown,
        price_amount: v.priceAmount ?? null,
        price_currency: v.priceCurrency ?? null,
        availability_note: v.availabilityNote ?? null,
        display_order: v.displayOrder,
      };
    }
  }
}

async function limitAdmin(purpose: "cms_mutation" | "inquiry_admin_action", userId: string) {
  const { enforceRateLimit } = await import("./public-site.server");
  // The bucket key is derived server-side from the authenticated subject only.
  await enforceRateLimit(purpose, `user:${userId}`);
}

export const adminListContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cmsListSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sort = data.sort ?? { column: "display_order" as const, ascending: true };
    let query = context.supabase
      .from(data.table)
      .select(SELECT_COLUMNS[data.table])
      .order(sort.column, { ascending: sort.ascending })
      .limit(500);
    if (data.status) query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error("Content could not be loaded.");
    return { rows: (rows ?? []) as unknown as CmsRow[] };
  });

export const adminSaveContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cmsSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await limitAdmin("cms_mutation", context.userId);
    const row = { ...toRow(data.table, data.values), updated_by: context.userId };

    if (!data.id) {
      const { data: created, error } = await context.supabase
        .from(data.table)
        .insert({ ...row, created_by: context.userId } as never)
        .select("id, content_version, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return created;
    }

    if (data.expectedVersion == null) throw conflict();
    const { data: updated, error } = await context.supabase
      .from(data.table)
      .update({ ...row, content_version: data.expectedVersion } as never)
      .eq("id", data.id)
      .select("id, content_version, updated_at")
      .maybeSingle();
    if (isConflict(error)) throw conflict();
    if (error) throw new Error(error.message);
    if (!updated) throw conflict();
    return updated;
  });

export const adminSetContentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cmsStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await limitAdmin("cms_mutation", context.userId);
    const { data: updated, error } = await context.supabase
      .from(data.table)
      .update({
        status: data.status,
        content_version: data.expectedVersion,
        updated_by: context.userId,
      } as never)
      .eq("id", data.id)
      .select("id, status, content_version, updated_at")
      .maybeSingle();
    if (isConflict(error)) throw conflict();
    if (error) throw new Error(error.message);
    if (!updated) throw conflict();
    return updated;
  });

/**
 * Ordering is the single optimistic surface in Stage 3: it is reversible,
 * carries no personal data and publishes nothing. The canonical order is
 * re-read afterwards so the client reconciles instead of trusting itself.
 */
export const adminReorderContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cmsReorderSchema.parse(input))
  .handler(async ({ data, context }) => {
    await limitAdmin("cms_mutation", context.userId);
    let position = 0;
    for (const item of data.order) {
      const { error } = await context.supabase
        .from(data.table)
        .update({
          display_order: position,
          content_version: item.expectedVersion,
          updated_by: context.userId,
        } as never)
        .eq("id", item.id);
      if (isConflict(error)) throw conflict();
      if (error) throw new Error(error.message);
      position += 1;
    }
    const { data: rows, error } = await context.supabase
      .from(data.table)
      .select("id, display_order, content_version")
      .order("display_order", { ascending: true })
      .limit(500);
    if (error) throw new Error("The new order could not be confirmed.");
    return { order: (rows ?? []) as unknown as CmsRow[] };
  });

export const adminListInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("public_inquiries")
      .select(
        "id, inquiry_type, full_name, email, phone, subject, message, status, handling_note, handled_at, created_at, retention_expires_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Inquiries could not be loaded.");
    return { rows: data ?? [] };
  });

export const adminUpdateInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inquiryStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await limitAdmin("inquiry_admin_action", context.userId);
    const { data: updated, error } = await context.supabase
      .from("public_inquiries")
      .update({ status: data.status, handling_note: data.note ?? null })
      .eq("id", data.id)
      .select("id, status, handled_at")
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
        "id, inquiry_id, subjects, qualifications_summary, years_experience, document_paths, malware_state, application_status, decision_note, decided_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Applications could not be loaded.");
    return { rows: data ?? [] };
  });

export const adminUpdateApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => applicationDecisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await limitAdmin("inquiry_admin_action", context.userId);
    const { data: updated, error } = await context.supabase
      .from("instructor_application_details")
      .update({
        application_status: data.applicationStatus,
        decision_note: data.note ?? null,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("id, application_status, decided_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("That application is no longer available.");
    return updated;
  });

/**
 * Short-lived, attachment-only access to a recruitment document.
 *
 * Object-level authorization is re-derived rather than trusted: the path must
 * belong to the named application row, the document must have passed scanning,
 * and the URL is signed with the caller's own client so the Storage policy
 * re-checks platform-administrator status.
 */
export const adminCreateDocumentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => signedDocumentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./public-site.server");
    await enforceRateLimit("signed_download", `user:${context.userId}`);

    const { data: owner, error: ownerError } = await context.supabase
      .from("instructor_application_details")
      .select("id, document_paths, malware_state")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (ownerError) throw new Error("That document could not be verified.");
    if (!owner || !owner.document_paths.includes(data.path)) {
      throw new Error("That document is not available.");
    }
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
      .select("id, entity_type, entity_id, action, actor_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Audit history could not be loaded.");
    return { rows: data ?? [] };
  });
