/**
 * Newsletter withdrawal.
 *
 * Withdrawal is as easy as subscribing: one link, one request, no sign-in.
 * The outcome is always "withdrawn" so an unknown or already-withdrawn token
 * is indistinguishable from a live one, and repeating the call is harmless.
 */
import { createFileRoute } from "@tanstack/react-router";
import { newsletterTokenSchema } from "@/lib/public-site.schemas";
import { PUBLIC_ERROR } from "@/lib/public-site.constants";

export const Route = createFileRoute("/api/public/newsletter/unsubscribe")({
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
          if (!parsed.success) return jsonOk({ outcome: "withdrawn" });

          const identity = deriveRequestIdentity(request, "newsletter_unsubscribe");
          await enforceRateLimit("newsletter_unsubscribe", identity.ipHash);

          const { error } = await serviceClient().rpc("withdraw_newsletter_subscription", {
            p_email_hash_or_token: hashNewsletterToken(parsed.data.token),
            p_evidence: { source: "public_website" },
          } as never);

          if (error) {
            throw new PublicBoundaryError(
              PUBLIC_ERROR.unavailable,
              "We could not complete that just now. Please try again later.",
              503,
            );
          }
          return jsonOk({ outcome: "withdrawn" });
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
