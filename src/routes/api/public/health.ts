/**
 * Public health endpoint.
 *
 * Returns a bare status only: no version, no database detail, no environment
 * value, no personal data. It is rate-limited like every other public surface
 * so it cannot be used as a free amplification or probing channel.
 */
import { createFileRoute } from "@tanstack/react-router";

function healthResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { enforceRateLimit, PublicBoundaryError, jsonError, serviceClient } =
          await import("@/lib/public-site.server");

        try {
          const header = process.env["TRUSTED_CLIENT_IP_HEADER"];
          const ip = header ? (request.headers.get(header)?.split(",")[0]?.trim() ?? "") : "";
          // Without a trusted network identifier every caller shares one bucket.
          await enforceRateLimit("health", ip || "shared");

          const started = Date.now();
          const { error } = await serviceClient()
            .from("submission_throttle")
            .select("id", { head: true, count: "exact" })
            .limit(1);
          const backend = error ? "degraded" : "ok";

          return healthResponse(
            {
              status: backend,
              checkedAt: new Date().toISOString(),
              latencyMs: Math.min(Date.now() - started, 60000),
            },
            backend === "ok" ? 200 : 503,
          );
        } catch (error) {
          if (error instanceof PublicBoundaryError) return jsonError(error);
          return healthResponse({ status: "degraded" }, 503);
        }
      },
    },
  },
});
