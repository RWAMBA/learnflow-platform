/**
 * Public sitemap.
 *
 * Only published, publicly readable content is listed; authenticated,
 * transactional and tokenised URLs are never emitted.
 */
import { createFileRoute } from "@tanstack/react-router";

const STATIC_PATHS = [
  "/",
  "/about",
  "/why-choose-us",
  "/services",
  "/testimonials",
  "/faqs",
  "/guide",
  "/merchandise",
  "/contact",
  "/consultation",
  "/instructors/apply",
  "/privacy-policy",
  "/cookie-policy",
];

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

export const Route = createFileRoute("/api/public/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const entries: Array<{ loc: string; lastmod?: string }> = STATIC_PATHS.map((path) => ({
          loc: `${origin}${path}`,
        }));

        try {
          const { publishableClient } = await import("@/lib/public-site.server");
          const client = publishableClient();

          const [guides, merch] = await Promise.all([
            client
              .from("guide_articles")
              .select("slug, updated_at")
              .eq("status", "published")
              .limit(1000),
            client
              .from("merchandise_items")
              .select("slug, updated_at")
              .eq("status", "published")
              .limit(1000),
          ]);

          for (const row of guides.data ?? []) {
            entries.push({ loc: `${origin}/guide/${row.slug}`, lastmod: row.updated_at ?? undefined });
          }
          for (const row of merch.data ?? []) {
            entries.push({
              loc: `${origin}/merchandise/${row.slug}`,
              lastmod: row.updated_at ?? undefined,
            });
          }
        } catch (error) {
          // A content outage must not break the sitemap: serve static paths.
          console.error("[public/sitemap]", error);
        }

        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) =>
      `  <url><loc>${xmlEscape(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${xmlEscape(new Date(entry.lastmod).toISOString())}</lastmod>` : ""}</url>`,
  )
  .join("\n")}
</urlset>`;

        return new Response(body, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=600",
          },
        });
      },
    },
  },
});
