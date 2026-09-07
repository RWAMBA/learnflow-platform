/** Search-crawler policy with an origin-correct sitemap URL. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth
Disallow: /dashboard
Disallow: /newsletter/confirm
Disallow: /newsletter/unsubscribe
Sitemap: ${origin}/sitemap.xml
`;

        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
