import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileWarning, ShieldAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  confirmEvidenceDocument,
  listRightsEvidence,
  requestEvidenceDownloadUrl,
  requestEvidenceUploadTicket,
} from "@/lib/rights-evidence.functions";
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MIME_ALLOWLIST,
  type EvidenceMimeType,
} from "@/lib/rights-evidence.schemas";
import { formatDateTime } from "@/lib/format";

const ACCEPT = Object.keys(EVIDENCE_MIME_ALLOWLIST).join(",");

export interface EvidenceGrantOption {
  id: string;
  label: string;
  expiryDate: string | null;
  restrictions: string | null;
}

function statusVariant(status: string) {
  if (status === "stored") return "default" as const;
  if (status === "withdrawn" || status === "superseded") return "destructive" as const;
  return "secondary" as const;
}

/**
 * Platform Administrator evidence journey. Every privileged operation is a
 * server function: the browser never learns an object path, and download links
 * are short-lived signed URLs minted only after the server re-verifies active
 * Platform Administrator status.
 */
export function EvidencePanel({ grants }: { grants: EvidenceGrantOption[] }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [grantId, setGrantId] = useState<string>(grants[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);

  const list = useServerFn(listRightsEvidence);
  const ticket = useServerFn(requestEvidenceUploadTicket);
  const confirm = useServerFn(confirmEvidenceDocument);
  const download = useServerFn(requestEvidenceDownloadUrl);

  const documents = useQuery({
    queryKey: ["rights", "evidence", grantId],
    queryFn: () => list({ data: { rightsGrantId: grantId || null } }),
    enabled: Boolean(grantId),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose an evidence document first");
      if (!grantId) throw new Error("Select the rights grant this evidence belongs to");
      if (file.size > EVIDENCE_MAX_BYTES) throw new Error("That file is larger than 25 MB");
      if (!(file.type in EVIDENCE_MIME_ALLOWLIST)) {
        throw new Error("Only PDF, PNG, JPEG and plain-text evidence is accepted");
      }
      const issued = await ticket({
        data: {
          rightsGrantId: grantId,
          filename: file.name,
          mimeType: file.type as EvidenceMimeType,
          byteSize: file.size,
        },
      });
      const uploaded = await supabase.storage
        .from(issued.bucket)
        .uploadToSignedUrl(issued.path, issued.token, file, { contentType: file.type });
      if (uploaded.error) throw new Error(uploaded.error.message);
      await confirm({ data: { evidenceId: issued.evidenceId } });
    },
    onSuccess: () => {
      toast.success("Evidence stored in the private rights vault");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["rights"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openDocument = useMutation({
    mutationFn: (evidenceId: string) => download({ data: { evidenceId } }),
    onSuccess: (result) => {
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success(`Link valid for ${result.expiresInSeconds} seconds`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedGrant = grants.find((grant) => grant.id === grantId) ?? null;
  const expired = Boolean(
    selectedGrant?.expiryDate && new Date(selectedGrant.expiryDate) < new Date(),
  );

  if (grants.length === 0) {
    return (
      <EmptyState
        title="No rights grants yet"
        description="Record a source and a rights grant before uploading licence evidence."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert aria-hidden="true" className="size-4" /> Private licence evidence
          </CardTitle>
          <CardDescription>
            Stored in a dedicated private vault, separate from tenant learning resources. Only
            active platform administrators can upload or open these documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="evidence-grant">Rights grant</Label>
            <Select value={grantId} onValueChange={setGrantId}>
              <SelectTrigger id="evidence-grant">
                <SelectValue placeholder="Select a rights grant" />
              </SelectTrigger>
              <SelectContent>
                {grants.map((grant) => (
                  <SelectItem key={grant.id} value={grant.id}>
                    {grant.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {expired ? (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <FileWarning aria-hidden="true" className="size-4" /> This grant has expired —
                evidence is retained for audit only.
              </p>
            ) : null}
            {selectedGrant?.restrictions ? (
              <p className="text-sm text-muted-foreground">
                Restrictions: {selectedGrant.restrictions}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="evidence-file">Evidence document</Label>
            <Input
              id="evidence-file"
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-sm text-muted-foreground">PDF, PNG, JPEG or TXT, up to 25 MB.</p>
            <Button
              type="button"
              disabled={!file || upload.isPending}
              onClick={() => upload.mutate()}
            >
              <Upload aria-hidden="true" className="size-4" />
              {upload.isPending ? "Uploading…" : "Upload evidence"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <QueryState
        isPending={documents.isPending}
        error={documents.error}
        data={documents.data}
        onRetry={() => void documents.refetch()}
        skeleton={<ListSkeleton rows={3} />}
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            title="No evidence recorded"
            description="Upload the licence, permission or contract that proves this grant."
          />
        }
      >
        {(rows) => (
          <ul className="divide-y rounded-md border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.original_filename}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.mime_type} · {Math.max(1, Math.round(row.byte_size / 1024))} KB ·{" "}
                    {formatDateTime(row.created_at)}
                  </p>
                  {row.withdrawal_reason ? (
                    <p className="text-sm text-destructive">Withdrawn: {row.withdrawal_reason}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={row.status !== "stored" || openDocument.isPending}
                    onClick={() => openDocument.mutate(row.id)}
                  >
                    <Download aria-hidden="true" className="size-4" /> Open
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
