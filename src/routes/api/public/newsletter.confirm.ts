/**
 * Newsletter double opt-in — step two.
 *
 * The token arrives from the confirmation link, is hashed with a server-only
 * salt and matched against the stored hash; the raw token is never persisted.
 * The response is the same whether the token was valid, already used or never
 * existed, so this cannot confirm that an address is on the list. Repeating a
 * successful confirmation is idempotent.
 */
import { createFileRoute } from "@tanstack/react-router";
import { newsletterTokenSchema } from "@/lib/public-site.schemas";
import { PUBLIC_ERROR, RETENTION_DAYS } from "@/lib/public-site.constants";

export const Route = createFileRoute("/api/public/newsletter/confirm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          PublicBoundaryError,
          assertSameOrigin,
          deriveRequestIdentity,
          enforceRateLimit,
          hashNewsletterToken,
          jsonError,
          jsonOk,
          readJsonBody,
          serviceClient,
        } = await import("@/lib/public-site.server");

        try {
          assertSameOrigin(request);
          const parsed = newsletterTokenSchema.safeParse(await readJsonBody(request));
          if (!parsed.success) {
            // Same shape as an unknown token: no enumeration signal.
            return jsonOk({ outcome: "invalid" });
          }

          const identity = deriveRequestIdentity(request, "newsletter_confirm");
          await enforceRateLimit("newsletter_confirm", identity.ipHash);

          const { data, error } = await serviceClient().rpc("confirm_newsletter_subscription", {
            p_token_hash: hashNewsletterToken(parsed.data.token),
            p_retention_days: RETENTION_DAYS.newsletter,
            p_evidence: { source: "public_website" },
          } as never);

          if (error) {
            throw new PublicBoundaryError(
              PUBLIC_ERROR.unavailable,
              "We could not complete that just now. Please try again later.",
              503,
            );
          }

          return jsonOk({ outcome: (data as unknown as string) ?? "invalid" });
        } catch (error) {
          if (error instanceof PublicBoundaryError) return jsonError(error);
          return jsonError(
            new PublicBoundaryError(
              PUBLIC_ERROR.unavailable,
              "We could not complete that just now. Please try again later.",
              503,
            ),
          );
        }
      },
    },
  },
});
