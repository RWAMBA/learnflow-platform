/**
 * Anonymous public submission boundary for contact, consultation,
 * merchandise and instructor-application inquiries.
 *
 * Order of enforcement — every step fails closed:
 *   origin -> body size -> strict schema -> honeypot -> fill time ->
 *   Turnstile -> durable rate limit -> derived identity -> database RPC.
 *
 * The browser supplies none of the stored security values: the fingerprint
 * and IP hash are derived here from the trusted proxy header and server-only
 * salts, and the raw address is discarded. Failures are generic so the
 * endpoint cannot be used to enumerate people, addresses or controls.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  consultationInquirySchema,
  contactInquirySchema,
  instructorApplicationSchema,
  merchandiseInquirySchema,
} from "@/lib/public-site.schemas";
import { MIN_FORM_FILL_MS, PUBLIC_ERROR, RETENTION_DAYS } from "@/lib/public-site.constants";

const envelope = z.discriminatedUnion("type", [
  z.object({ type: z.literal("contact"), payload: contactInquirySchema }).strict(),
  z.object({ type: z.literal("consultation"), payload: consultationInquirySchema }).strict(),
  z.object({ type: z.literal("merchandise"), payload: merchandiseInquirySchema }).strict(),
  z
    .object({ type: z.literal("instructor_application"), payload: instructorApplicationSchema })
    .strict(),
]);

export const Route = createFileRoute("/api/public/inquiries")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mod = await import("@/lib/public-site.server");
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
          readJsonBody,
          serviceClient,
          verifyTurnstile,
        } = mod;

        try {
          assertSameOrigin(request);
          const raw = await readJsonBody(request);

          const parsed = envelope.safeParse(raw);
          if (!parsed.success) {
            throw new PublicBoundaryError(
              PUBLIC_ERROR.validation,
              "Please check the highlighted fields and try again.",
              400,
              undefined,
              fieldErrorsFrom(parsed.error.issues),
            );
          }
          const { type, payload } = parsed.data;

          assertHoneypotEmpty(payload.website);
          assertHumanTiming(payload.renderedAt, MIN_FORM_FILL_MS);
          await verifyTurnstile(payload.turnstileToken, request);

          const identity = deriveRequestIdentity(request, type);
          await enforceRateLimit(type, identity.ipHash);

          const details: Record<string, unknown> = {};
          let subject: string | null = null;
          let phone: string | null = null;
          let merchandiseId: string | null = null;
          let instructor: Record<string, unknown> | null = null;

          if (type === "contact") {
            subject = payload.subject;
            phone = payload.phone ?? null;
          } else if (type === "consultation") {
            phone = payload.phone;
            subject = "Consultation request";
            details["learnerCount"] = payload.learnerCount;
            details["preferredContact"] = payload.preferredContact;
            details["interest"] = payload.interest;
          } else if (type === "merchandise") {
            phone = payload.phone ?? null;
            subject = "Merchandise enquiry";
            merchandiseId = payload.merchandiseId;
            details["quantity"] = payload.quantity;
          } else {
            phone = payload.phone;
            subject = "Instructor application";
            if (payload.portfolioUrl) details["portfolioUrl"] = payload.portfolioUrl;
            instructor = {
              subjects: payload.subjects,
              qualifications_summary: payload.qualificationsSummary,
              years_experience: payload.yearsExperience,
              document_paths: payload.documentPaths,
            };
          }

          const { data, error } = await serviceClient().rpc("submit_public_inquiry", {
            p_inquiry_type: type,
            p_full_name: payload.fullName,
            p_email: payload.email,
            p_phone: phone,
            p_subject: subject,
            p_message: payload.message,
            p_details: details,
            p_related_merchandise_id: merchandiseId,
            p_fingerprint: identity.fingerprint,
            p_ip_hash: identity.ipHash,
            p_user_agent_family: identity.userAgentFamily,
            p_retention_days: RETENTION_DAYS.inquiry,
            p_instructor: instructor,
          });

          if (error) {
            // Never surface a raw database message to an anonymous caller.
            throw new PublicBoundaryError(
              PUBLIC_ERROR.validation,
              "We could not accept this submission. Please try again.",
              400,
            );
          }

          const row = Array.isArray(data) ? data[0] : data;
          const duplicate = Boolean((row as { duplicate?: boolean } | null)?.duplicate);

          // Idempotent: a repeat inside the same UTC hour is acknowledged, not
          // duplicated, and no identifier is echoed back to the browser.
          return jsonOk({ received: true, duplicate });
        } catch (error) {
          if (error instanceof PublicBoundaryError) return jsonError(error);
          return jsonError(
            new PublicBoundaryError(
              PUBLIC_ERROR.unavailable,
              "We could not accept this submission. Please try again later.",
              503,
            ),
          );
        }
      },
    },
  },
});
