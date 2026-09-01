/**
 * Issues a short-lived signed upload ticket for instructor-application
 * documents.
 *
 * The browser never chooses the destination path and never holds a storage
 * credential: the server derives the path, signs a single-use upload URL for
 * the private `instructor-applications` bucket, and rate-limits issuance.
 * Only the returned path may later be submitted with the application.
 */
import { createFileRoute } from "@tanstack/react-router";
import { uploadTicketSchema } from "@/lib/public-site.schemas";
import { PUBLIC_ERROR } from "@/lib/public-site.constants";

const EXTENSION_BY_TYPE: Record<string, "pdf" | "docx"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export const Route = createFileRoute("/api/public/upload-ticket")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          PublicBoundaryError,
          assertSameOrigin,
          deriveRequestIdentity,
          enforceRateLimit,
          fieldErrorsFrom,
          generateUploadPath,
          jsonError,
          jsonOk,
          readJsonBody,
          serviceClient,
          verifyTurnstile,
        } = await import("@/lib/public-site.server");

        try {
          assertSameOrigin(request);
          const parsed = uploadTicketSchema.safeParse(await readJsonBody(request));
          if (!parsed.success) {
            throw new PublicBoundaryError(
              PUBLIC_ERROR.validation,
              "That file cannot be accepted. Use a PDF or DOCX under 5 MB.",
              400,
              undefined,
              fieldErrorsFrom(parsed.error.issues),
            );
          }

          await verifyTurnstile(parsed.data.turnstileToken, request);
          const identity = deriveRequestIdentity(request, "upload_ticket");
          await enforceRateLimit("upload_ticket", identity.ipHash);

          const extension = EXTENSION_BY_TYPE[parsed.data.contentType];
          if (!extension) {
            throw new PublicBoundaryError(
              PUBLIC_ERROR.validation,
              "Only PDF and DOCX documents are accepted.",
              400,
            );
          }

          const path = generateUploadPath(crypto.randomUUID(), extension);
          const { data, error } = await serviceClient()
            .storage.from("instructor-applications")
            .createSignedUploadUrl(path);

          if (error || !data) {
            throw new PublicBoundaryError(
              PUBLIC_ERROR.unavailable,
              "Uploads are temporarily unavailable. Please try again shortly.",
              503,
            );
          }

          return jsonOk({ path: data.path, token: data.token, signedUrl: data.signedUrl });
        } catch (error) {

          console.error("[public/upload-ticket]", error);
          return jsonError(
            new PublicBoundaryError(
              PUBLIC_ERROR.unavailable,
              "Something went wrong. Please try again shortly.",
              503,
            ),
          );
        }
      },
    },
  },
});
