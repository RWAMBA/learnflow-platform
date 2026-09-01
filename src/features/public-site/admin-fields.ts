/**
 * Stage 3 — declarative field descriptors for the CMS editor.
 *
 * Keeping the shape of each entity in one place means the editor, the payload
 * builder and the validation messages cannot drift apart, and no dynamic key
 * is ever forwarded to the server: the payload is assembled from this list.
 */
import type { CmsTable } from "@/lib/public-site-admin.schemas";

export interface CmsField {
  /** camelCase key sent to the server function. */
  key: string;
  /** snake_case column returned by the read. */
  column: string;
  label: string;
  kind: "text" | "textarea" | "markdown" | "number" | "tags";
  required?: boolean;
  help?: string;
}

export interface CmsEntity {
  table: CmsTable;
  singular: string;
  plural: string;
  /** Column shown as the row title in the list. */
  titleColumn: string;
  fields: CmsField[];
}

const ORDER_FIELD: CmsField = {
  key: "displayOrder",
  column: "display_order",
  label: "Display order",
  kind: "number",
  required: true,
  help: "Lower numbers appear first.",
};

export const CMS_ENTITIES: CmsEntity[] = [
  {
    table: "site_content",
    singular: "content block",
    plural: "Site content",
    titleColumn: "title",
    fields: [
      {
        key: "contentKey",
        column: "content_key",
        label: "Content key",
        kind: "text",
        required: true,
        help: "Unique, lowercase, e.g. about.mission",
      },
      {
        key: "pageSlug",
        column: "page_slug",
        label: "Page",
        kind: "text",
        required: true,
        help: "Page this block belongs to, e.g. about",
      },
      { key: "title", column: "title", label: "Title", kind: "text", required: true },
      { key: "summary", column: "summary", label: "Summary", kind: "textarea" },
      {
        key: "bodyMarkdown",
        column: "body_markdown",
        label: "Body (Markdown)",
        kind: "markdown",
      },
      ORDER_FIELD,
    ],
  },
  {
    table: "guide_articles",
    singular: "guide article",
    plural: "Guide articles",
    titleColumn: "title",
    fields: [
      { key: "slug", column: "slug", label: "Slug", kind: "text", required: true },
      { key: "title", column: "title", label: "Title", kind: "text", required: true },
      { key: "summary", column: "summary", label: "Summary", kind: "textarea", required: true },
      {
        key: "bodyMarkdown",
        column: "body_markdown",
        label: "Body (Markdown)",
        kind: "markdown",
      },
      { key: "category", column: "category", label: "Category", kind: "text", required: true },
      { key: "tags", column: "tags", label: "Tags", kind: "tags", help: "Comma separated." },
      {
        key: "readingMinutes",
        column: "reading_minutes",
        label: "Reading minutes",
        kind: "number",
      },
      {
        key: "seoDescription",
        column: "seo_description",
        label: "SEO description",
        kind: "textarea",
      },
      ORDER_FIELD,
    ],
  },
  {
    table: "testimonials",
    singular: "testimonial",
    plural: "Testimonials",
    titleColumn: "author_name",
    fields: [
      { key: "authorName", column: "author_name", label: "Author", kind: "text", required: true },
      { key: "authorRole", column: "author_role", label: "Role", kind: "text" },
      { key: "authorLocation", column: "author_location", label: "Location", kind: "text" },
      { key: "quote", column: "quote", label: "Quote", kind: "textarea", required: true },
      ORDER_FIELD,
    ],
  },
  {
    table: "faqs",
    singular: "FAQ",
    plural: "FAQs",
    titleColumn: "question",
    fields: [
      { key: "question", column: "question", label: "Question", kind: "text", required: true },
      {
        key: "answerMarkdown",
        column: "answer_markdown",
        label: "Answer (Markdown)",
        kind: "markdown",
        required: true,
      },
      { key: "category", column: "category", label: "Category", kind: "text", required: true },
      ORDER_FIELD,
    ],
  },
  {
    table: "merchandise_items",
    singular: "merchandise item",
    plural: "Merchandise",
    titleColumn: "name",
    fields: [
      { key: "slug", column: "slug", label: "Slug", kind: "text", required: true },
      { key: "name", column: "name", label: "Name", kind: "text", required: true },
      { key: "summary", column: "summary", label: "Summary", kind: "textarea", required: true },
      {
        key: "descriptionMarkdown",
        column: "description_markdown",
        label: "Description (Markdown)",
        kind: "markdown",
      },
      { key: "priceAmount", column: "price_amount", label: "Price", kind: "number" },
      {
        key: "priceCurrency",
        column: "price_currency",
        label: "Currency",
        kind: "text",
        help: "Three-letter code, e.g. KES. Required when a price is set.",
      },
      {
        key: "availabilityNote",
        column: "availability_note",
        label: "Availability note",
        kind: "text",
      },
      ORDER_FIELD,
    ],
  },
];

/** Builds the strict payload the server expects from raw editor state. */
export function buildValues(entity: CmsEntity, form: Record<string, string>) {
  const values: Record<string, unknown> = {};
  for (const field of entity.fields) {
    const raw = (form[field.key] ?? "").trim();
    if (field.kind === "number") {
      values[field.key] = raw === "" ? (field.key === "displayOrder" ? 0 : null) : Number(raw);
    } else if (field.kind === "tags") {
      values[field.key] = raw === "" ? [] : raw.split(",").map((t) => t.trim()).filter(Boolean);
    } else if (field.required || field.kind === "markdown") {
      values[field.key] = raw;
    } else {
      values[field.key] = raw === "" ? null : raw;
    }
  }
  return values;
}
