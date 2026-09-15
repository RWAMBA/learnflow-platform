/**
 * Public health endpoint.
 *
 * Returns a bare status only: no version, no database detail, no environment
 * value, no personal data. It is rate-limited like every other public surface
 * so it cannot be used as a free amplification or probing channel.
 *
 * A throttled request answers 429 with `status: "throttled"` so the client can
 * tell "the limiter said wait" apart from "the backend is down". The limiter
 * itself is never bypassed and the probe never reports healthy on failure.
 */
import { createFileRoute } from "@tanstack/react-router";

function healthResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { enforceRateLimit, PublicBoundaryError, serviceClient } =
          await import("@/lib/public-site.server");

        try {
          const header = process.env["TRUSTED_CLIENT_IP_HEADER"];
          const forwarded =
            (header ? request.headers.get(header) : null) ??
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-real-ip") ??
            request.headers.get("x-forwarded-for");
          // Without a trusted network identifier every caller shares one bucket.
          const ip = forwarded?.split(",")[0]?.trim() ?? "";
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
          // Throttling is a protective success, not an outage. Say so explicitly
          // and truthfully, without leaking any internal detail.
          if (error instanceof PublicBoundaryError && error.status === 429) {
            const retry = error.retryAfterSeconds ?? 60;
            return healthResponse({ status: "throttled", retryAfterSeconds: retry }, 429, {
              "retry-after": String(retry),
            });
          }
          return healthResponse({ status: "degraded" }, 503);
        }
      },
    },
  },
});
