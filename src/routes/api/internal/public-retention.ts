/**
 * Scheduled Stage 3 retention boundary.
 *
 * Vercel invokes this route with CRON_SECRET. Private instructor documents are
 * removed through the Storage API before the service-only database RPC clears
 * their paths and irreversibly replaces expired PII with tombstones.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

const BATCH_SIZE = 500;

function authorized(request: Request): boolean {
  const secret = process.env["CRON_SECRET"];
  const supplied = request.headers.get("authorization");
  if (!secret || !supplied?.startsWith("Bearer ")) return false;
  const expectedBytes = Buffer.from(`Bearer ${secret}`);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export const Route = createFileRoute("/api/internal/public-retention")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return response({ ok: false }, 401);

        const { serviceClient } = await import("@/lib/public-site.server");
        const client = serviceClient();
        const now = new Date().toISOString();

        const { data: expired, error: inquiryError } = await client
          .from("public_inquiries")
          .select("id")
          .lt("retention_expires_at", now)
          .not("email", "like", "redacted+%@invalid.invalid")
          .order("retention_expires_at", { ascending: true })
          .limit(BATCH_SIZE);
        if (inquiryError) return response({ ok: false }, 503);

        const inquiryIds = (expired ?? []).map((row) => row.id);
        let documentPaths: string[] = [];
        if (inquiryIds.length > 0) {
          const { data: applications, error: applicationError } = await client
            .from("instructor_application_details")
            .select("document_paths")
            .in("inquiry_id", inquiryIds);
          if (applicationError) return response({ ok: false }, 503);
          documentPaths = [...new Set((applications ?? []).flatMap((row) => row.document_paths))];
        }

        if (documentPaths.length > 0) {
          const { error } = await client.storage
            .from("instructor-applications")
            .remove(documentPaths);
          if (error) return response({ ok: false }, 503);
        }

        const { data, error } = await client.rpc("finalize_public_retention", {
          p_inquiry_ids: inquiryIds,
        });
        if (error) return response({ ok: false }, 503);

        const result = Array.isArray(data) ? data[0] : data;
        return response(
          {
            ok: true,
            inquiriesRedacted: result?.inquiries_redacted ?? 0,
            newslettersRedacted: result?.newsletters_redacted ?? 0,
            documentsRemoved: documentPaths.length,
          },
          200,
        );
      },
    },
  },
});
