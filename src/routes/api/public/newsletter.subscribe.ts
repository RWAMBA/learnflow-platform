/**
 * Newsletter double opt-in — step one.
 *
 * Records a pending subscription with a hashed, expiring confirmation token
 * and an append-only consent event carrying the exact wording shown. No
 * marketing message is ever sent before confirmation, and the response is
 * identical for a new, pending, confirmed or suppressed address so the
 * endpoint cannot be used to test whether someone is subscribed.
 */
import { createFileRoute } from "@tanstack/react-router";
import { newsletterSubscribeSchema } from "@/lib/public-site.schemas";
import {
  MIN_FORM_FILL_MS,
  NEWSLETTER_CONSENT_TEXT,
  NEWSLETTER_CONSENT_VERSION,
  NEWSLETTER_TOKEN_TTL_MINUTES,
  POLICY_VERSION,
  PUBLIC_ERROR,
} from "@/lib/public-site.constants";

export const Route = createFileRoute("/api/public/newsletter/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          PublicBoundaryError,
          assertHoneypotEmpty,
          assertHumanTiming,
          assertSameOrigin,
          deriveRequestIdentity,
          enforceRateLimit,
          fieldErrorsFrom,
          jsonError,
          jsonOk,
          missingPublicSiteConfig,
          newTokenPair,
          readJsonBody,
          serviceClient,
          verifyTurnstile,
        } = await import("@/lib/public-site.server");

        try {
          assertSameOrigin(request);

          // Fail closed: without a delivery provider we cannot honour double
          // opt-in, so we refuse rather than collect an address we cannot use.
          const missing = missingPublicSiteConfig(["newsletterSalt", "emailProvider"]);
          if (missing.length > 0) {
            throw new PublicBoundaryError(
              PUBLIC_ERROR.notConfigured,
              "Newsletter sign-up is temporarily unavailable.",
              503,
            );
          }

          const parsed = newsletterSubscribeSchema.safeParse(await readJsonBody(request));
          if (!parsed.success) {
            throw new PublicBoundaryError(
              PUBLIC_ERROR.validation,
              "Please check the highlighted fields and try again.",
              400,
              undefined,
              fieldErrorsFrom(parsed.error.issues),
            );
          }
          const payload = parsed.data;

          assertHoneypotEmpty(payload.website);
          assertHumanTiming(payload.renderedAt, MIN_FORM_FILL_MS);
          await verifyTurnstile(payload.turnstileToken, request);

          const identity = deriveRequestIdentity(request, "newsletter");
          await enforceRateLimit("newsletter_subscribe", identity.ipHash);

          const { tokenHash } = newTokenPair();
          const { error } = await serviceClient().rpc("request_newsletter_subscription", {
            p_email: payload.email,
            p_token_hash: tokenHash,
            p_token_ttl_minutes: NEWSLETTER_TOKEN_TTL_MINUTES,
            p_consent_text: NEWSLETTER_CONSENT_TEXT,
            p_consent_text_version: NEWSLETTER_CONSENT_VERSION,
            p_policy_version: POLICY_VERSION,
            p_evidence: { source: "public_website" },
          } as never);

          if (error) {
            throw new PublicBoundaryError(
              PUBLIC_ERROR.unavailable,
              "Newsletter sign-up is temporarily unavailable.",
              503,
            );
          }

          // Deliberately uniform: never reveal the stored state of an address.
          return jsonOk({ received: true });
        } catch (error) {
          if (error instanceof PublicBoundaryError) return jsonError(error);
          return jsonError(
            new PublicBoundaryError(
              PUBLIC_ERROR.unavailable,
              "Newsletter sign-up is temporarily unavailable.",
              503,
            ),
          );
        }
      },
    },
  },
});
