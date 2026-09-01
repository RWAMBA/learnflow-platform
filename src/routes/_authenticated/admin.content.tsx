/**
 * Stage 3 — Platform Administration for the public website.
 *
 * Nothing here grants authority: the underlying RLS policies decide whether a
 * read or a write succeeds, and a non-administrator simply sees an honest
 * restricted-area state. Publication, archival and ordering are explicit
 * actions with real server confirmation; only reordering renders optimistically
 * and it reconciles against the canonical order the server returns.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, Loader2, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryState } from "@/components/shared/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoleContext } from "@/features/roles/role-context";
import { formatDateTime } from "@/lib/format";
import { CMS_ENTITIES, buildValues, type CmsEntity } from "@/features/public-site/admin-fields";
import {
  adminCreateDocumentLink,
  adminListApplications,
  adminListContent,
  adminListInquiries,
  adminListNewsletter,
  adminListSiteAudit,
  adminReorderContent,
  adminSaveContent,
  adminSetContentStatus,
  adminUpdateApplication,
  adminUpdateInquiry,
} from "@/lib/public-site-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/content")({
  head: () => ({
    meta: [
      { title: "Public website administration — LearnFlow" },
      {
        name: "description",
        content:
          "Manage published website content, inquiries, instructor applications and newsletter state.",
      },
      { property: "og:title", content: "Public website administration — LearnFlow" },
      {
        property: "og:description",
        content: "Manage published website content, inquiries and applications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Row = Record<string, string | number | boolean | null | string[]>;

function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "published" ? "default" : status === "archived" ? "secondary" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

/* ------------------------------------------------------------------ *
 * CMS entity panel
 * ------------------------------------------------------------------ */

function EntityPanel({ entity }: { entity: CmsEntity }) {
  const queryClient = useQueryClient();
  const key = ["cms", entity.table];
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [pendingOrder, setPendingOrder] = useState<Row[] | null>(null);

  const list = useQuery({
    queryKey: key,
    queryFn: () => adminListContent({ data: { table: entity.table } }),
  });

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: "draft" | "published" | "archived"; updatedAt: string }) =>
      adminSetContentStatus({
        data: {
          table: entity.table,
          id: input.id,
          status: input.status,
          expectedUpdatedAt: input.updatedAt,
        },
      }),
    onSuccess: async () => {
      toast.success("Saved.");
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (error) => toast.error(message(error)),
  });

  const reorder = useMutation({
    mutationFn: (items: Array<{ id: string; displayOrder: number }>) =>
      adminReorderContent({ data: { table: entity.table, items } }),
    onSuccess: async () => {
      setPendingOrder(null);
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: async (error) => {
      // Deterministic rollback: discard the optimistic view, re-read canonical.
      setPendingOrder(null);
      toast.error(message(error));
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const rows = (pendingOrder ?? (list.data?.rows as Row[] | undefined) ?? []) as Row[];

  function move(index: number, direction: -1 | 1) {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const a = next[index]!;
    const b = next[target]!;
    next[index] = b;
    next[target] = a;
    setPendingOrder(next);
    reorder.mutate(next.map((row, i) => ({ id: String(row["id"]), displayOrder: i })));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {reorder.isPending ? "Saving new order…" : `${rows.length} item(s).`}
        </p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          New {entity.singular}
        </Button>
      </div>

      <QueryState
        isPending={list.isPending}
        error={list.error}
        data={list.data}
        onRetry={() => void list.refetch()}
        isEmpty={() => rows.length === 0}
        empty={
          <EmptyState
            title={`No ${entity.plural.toLowerCase()} yet`}
            description="Nothing has been created. The public site shows an honest empty state until something is published."
          />
        }
      >
        {() => (
          <ul className="space-y-2">
            {rows.map((row, index) => {
              const status = String(row["status"] ?? "draft");
              const updatedAt = String(row["updated_at"] ?? "");
              return (
                <li key={String(row["id"])}>
                  <Card>
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {String(row[entity.titleColumn] ?? "Untitled")}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <StatusBadge status={status} />
                          <span>order {String(row["display_order"] ?? 0)}</span>
                          <span>updated {updatedAt ? formatDateTime(updatedAt) : "—"}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          aria-label={`Move ${String(row[entity.titleColumn])} up`}
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                        >
                          Up
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          aria-label={`Move ${String(row[entity.titleColumn])} down`}
                          onClick={() => move(index, 1)}
                          disabled={index === rows.length - 1}
                        >
                          Down
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => setEditing(row)}
                        >
                          Edit
                        </Button>
                        {status !== "published" ? (
                          <Button
                            size="sm"
                            className="min-h-11"
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({
                                id: String(row["id"]),
                                status: "published",
                                updatedAt,
                              })
                            }
                          >
                            Publish
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="min-h-11"
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({
                                id: String(row["id"]),
                                status: "draft",
                                updatedAt,
                              })
                            }
                          >
                            Unpublish
                          </Button>
                        )}
                        {status !== "archived" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11"
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({
                                id: String(row["id"]),
                                status: "archived",
                                updatedAt,
                              })
                            }
                          >
                            Archive
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>

      {editing ? (
        <EntityEditor
          entity={entity}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await queryClient.invalidateQueries({ queryKey: key });
          }}
        />
      ) : null}
    </div>
  );
}

function EntityEditor({
  entity,
  row,
  onClose,
  onSaved,
}: {
  entity: CmsEntity;
  row: Row | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of entity.fields) {
      const value = row?.[field.column];
      initial[field.key] = Array.isArray(value)
        ? value.join(", ")
        : value == null
          ? field.kind === "number"
            ? ""
            : ""
          : String(value);
    }
    return initial;
  });
  const [conflict, setConflict] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      adminSaveContent({
        data: {
          table: entity.table,
          id: row ? String(row["id"]) : null,
          expectedUpdatedAt: row ? String(row["updated_at"]) : null,
          values: buildValues(entity, form),
        } as never,
      }),
    onSuccess: async () => {
      toast.success("Saved.");
      await onSaved();
    },
    onError: (error) => {
      const text = message(error);
      if (/changed since you opened it|VERSION_CONFLICT/i.test(text)) setConflict(true);
      toast.error(text);
    },
  });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {row ? `Edit ${entity.singular}` : `New ${entity.singular}`}
          </DialogTitle>
          <DialogDescription>
            Saving records an immutable audit entry. Publication is a separate, explicit action.
          </DialogDescription>
        </DialogHeader>

        {conflict ? (
          <div role="alert" className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <span>
              This item changed since you opened it. Close and reopen it to load the current
              version before saving again.
            </span>
          </div>
        ) : null}

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          {entity.fields.map((field) => {
            const id = `${entity.table}-${field.key}`;
            const common = {
              id,
              value: form[field.key] ?? "",
              required: field.required,
              "aria-describedby": field.help ? `${id}-help` : undefined,
              onChange: (
                event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
              ) => setForm((prev) => ({ ...prev, [field.key]: event.target.value })),
            };
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={id}>
                  {field.label}
                  {field.required ? <span aria-hidden="true"> *</span> : null}
                </Label>
                {field.kind === "textarea" || field.kind === "markdown" ? (
                  <Textarea {...common} rows={field.kind === "markdown" ? 10 : 3} />
                ) : (
                  <Input {...common} inputMode={field.kind === "number" ? "numeric" : undefined} />
                )}
                {field.help ? (
                  <p id={`${id}-help`} className="text-xs text-muted-foreground">
                    {field.help}
                  </p>
                ) : null}
              </div>
            );
          })}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Submissions
 * ------------------------------------------------------------------ */

function InquiriesPanel() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["cms", "inquiries"], queryFn: () => adminListInquiries() });
  const update = useMutation({
    mutationFn: (input: { id: string; status: "in_review" | "responded" | "closed" | "spam" }) =>
      adminUpdateInquiry({ data: { id: input.id, status: input.status } }),
    onSuccess: async () => {
      toast.success("Inquiry updated.");
      await queryClient.invalidateQueries({ queryKey: ["cms", "inquiries"] });
    },
    onError: (error) => toast.error(message(error)),
  });

  return (
    <QueryState
      isPending={list.isPending}
      error={list.error}
      data={list.data}
      onRetry={() => void list.refetch()}
      isEmpty={(data) => data.rows.length === 0}
      empty={<EmptyState title="No inquiries yet" description="Public enquiries appear here." />}
    >
      {(data) => (
        <ul className="space-y-2">
          {data.rows.map((row) => (
            <li key={row.id}>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{row.inquiry_type}</Badge>
                    <Badge>{row.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(row.created_at)}
                    </span>
                  </div>
                  <p className="font-medium">{row.subject ?? "(no subject)"}</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.message}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(["in_review", "responded", "closed", "spam"] as const).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={update.isPending || row.status === "closed"}
                        onClick={() => update.mutate({ id: row.id, status })}
                      >
                        {status.replace("_", " ")}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

function ApplicationsPanel() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["cms", "applications"],
    queryFn: () => adminListApplications(),
  });
  const update = useMutation({
    mutationFn: (input: {
      id: string;
      applicationStatus: "screening" | "interview" | "accepted" | "declined";
    }) =>
      adminUpdateApplication({
        data: { id: input.id, applicationStatus: input.applicationStatus },
      }),
    onSuccess: async () => {
      toast.success("Application updated.");
      await queryClient.invalidateQueries({ queryKey: ["cms", "applications"] });
    },
    onError: (error) => toast.error(message(error)),
  });
  const link = useMutation({
    mutationFn: (path: string) => adminCreateDocumentLink({ data: { path } }),
    onSuccess: (result) => window.open(result.url, "_blank", "noopener,noreferrer"),
    onError: (error) => toast.error(message(error)),
  });

  return (
    <QueryState
      isPending={list.isPending}
      error={list.error}
      data={list.data}
      onRetry={() => void list.refetch()}
      isEmpty={(data) => data.rows.length === 0}
      empty={
        <EmptyState
          title="No instructor applications yet"
          description="Applications submitted from the public site appear here."
        />
      }
    >
      {(data) => (
        <ul className="space-y-2">
          {data.rows.map((row) => (
            <li key={row.id}>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{row.application_status}</Badge>
                    <Badge variant={row.malware_state === "clean" ? "outline" : "destructive"}>
                      documents {row.malware_state}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(row.created_at)}
                    </span>
                  </div>
                  <p className="text-sm">
                    {row.years_experience} year(s) experience · {row.subjects.join(", ")}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {row.qualifications_summary}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {row.document_paths.map((path) => (
                      <Button
                        key={path}
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={link.isPending || row.malware_state !== "clean"}
                        onClick={() => link.mutate(path)}
                      >
                        <Download className="mr-1.5 size-4" aria-hidden="true" />
                        Document
                      </Button>
                    ))}
                    {(["screening", "interview", "accepted", "declined"] as const).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="ghost"
                        className="min-h-11"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: row.id, applicationStatus: status })}
                      >
                        {status}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

function NewsletterPanel() {
  const list = useQuery({ queryKey: ["cms", "newsletter"], queryFn: () => adminListNewsletter() });
  return (
    <QueryState
      isPending={list.isPending}
      error={list.error}
      data={list.data}
      onRetry={() => void list.refetch()}
      isEmpty={(data) => data.rows.length === 0}
      empty={
        <EmptyState
          title="No newsletter records yet"
          description="Double opt-in subscriptions appear here once someone signs up."
        />
      }
    >
      {(data) => (
        <ul className="divide-y rounded-lg border">
          {data.rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="text-sm">{row.email_normalized}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{row.state}</Badge>
                consent {row.consent_text_version ?? "—"} · policy {row.policy_version ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

function AuditPanel() {
  const list = useQuery({ queryKey: ["cms", "audit"], queryFn: () => adminListSiteAudit() });
  return (
    <QueryState
      isPending={list.isPending}
      error={list.error}
      data={list.data}
      onRetry={() => void list.refetch()}
      isEmpty={(data) => data.rows.length === 0}
      empty={
        <EmptyState
          title="No audit entries yet"
          description="Every publication, archival and status change is recorded here and cannot be edited or deleted."
        />
      }
    >
      {(data) => (
        <ul className="divide-y rounded-lg border text-sm">
          {data.rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                {row.entity_type} · {row.action}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(row.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

function Page() {
  const { viewer } = useRoleContext();
  const entities = useMemo(() => CMS_ENTITIES, []);

  if (!viewer.isPlatformAdmin) {
    return (
      <div>
        <PageHeader
          title="Public website"
          description="Content, submissions and newsletter state for the public site."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Restricted area"
          description="Only platform administrators can manage the public website."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Public website"
        description="Content, submissions and newsletter state for the public site."
      />
      <Tabs defaultValue={entities[0]!.table}>
        <TabsList className="mb-4 flex flex-wrap">
          {entities.map((entity) => (
            <TabsTrigger key={entity.table} value={entity.table}>
              {entity.plural}
            </TabsTrigger>
          ))}
          <TabsTrigger value="inquiries">Inquiries</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="newsletter">Newsletter</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {entities.map((entity) => (
          <TabsContent key={entity.table} value={entity.table}>
            <EntityPanel entity={entity} />
          </TabsContent>
        ))}
        <TabsContent value="inquiries">
          <InquiriesPanel />
        </TabsContent>
        <TabsContent value="applications">
          <ApplicationsPanel />
        </TabsContent>
        <TabsContent value="newsletter">
          <NewsletterPanel />
        </TabsContent>
        <TabsContent value="audit">
          <AuditPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
