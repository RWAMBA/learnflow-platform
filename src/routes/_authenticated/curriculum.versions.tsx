import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CurriculumStatusBadge } from "@/features/curriculum/components/status-badge";
import {
  CloneVersionDialog,
  CurriculumVersionDialog,
} from "@/features/curriculum/components/hierarchy-dialogs";
import { curriculumKeys, listCurricula } from "@/features/curriculum/api";
import { hierarchyKeys, listCurriculumVersions } from "@/features/curriculum/hierarchy-api";
import { setCurriculumVersionStatus } from "@/lib/curriculum-hierarchy.functions";
import { canAuthorCurriculum } from "@/features/roles/permissions";
import { useRoleContext } from "@/features/roles/role-context";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/curriculum/versions")({
  head: () => ({
    meta: [
      { title: "Curriculum versions — the Platform" },
      {
        name: "description",
        content: "Create, clone, publish, archive and restore curriculum versions.",
      },
      { property: "og:title", content: "Curriculum versions — the Platform" },
      {
        property: "og:description",
        content: "Version history for curriculum frameworks, with clone and restore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CurriculumVersionsPage,
});

function CurriculumVersionsPage() {
  const { activeRole } = useRoleContext();
  const organizationId = activeRole?.organizationId ?? "";
  const mayAuthor = canAuthorCurriculum(activeRole?.roleCode) && Boolean(organizationId);
  const queryClient = useQueryClient();
  const [curriculumId, setCurriculumId] = useState<string>("all");

  const curricula = useQuery({ queryKey: curriculumKeys.curricula(), queryFn: listCurricula });

  const selected = curriculumId === "all" ? null : curriculumId;
  const versions = useQuery({
    queryKey: hierarchyKeys.versions(selected),
    queryFn: () => listCurriculumVersions(selected),
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["curriculum", "versions"] });

  const changeStatus = useServerFn(setCurriculumVersionStatus);
  const statusMutation = useMutation({
    mutationFn: (input: { versionId: string; status: "draft" | "published" | "archived" }) =>
      changeStatus({ data: { organizationId, ...input } }),
    onSuccess: () => {
      toast.success("Version updated");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="Curriculum versions"
        description="Published curriculum is never overwritten — clone a version to prepare changes."
        actions={
          mayAuthor ? (
            <CurriculumVersionDialog
              organizationId={organizationId}
              curricula={curricula.data ?? []}
              onSaved={refresh}
              trigger={
                <Button>
                  <Plus aria-hidden="true" className="size-4" /> New version
                </Button>
              }
            />
          ) : undefined
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="max-w-sm">
          <Label htmlFor="version-curriculum">Curriculum framework</Label>
          <Select value={curriculumId} onValueChange={setCurriculumId}>
            <SelectTrigger id="version-curriculum">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All frameworks</SelectItem>
              {(curricula.data ?? []).map((curriculum) => (
                <SelectItem key={curriculum.id} value={curriculum.id}>
                  {curriculum.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <QueryState
        isPending={versions.isPending}
        error={versions.error}
        data={versions.data}
        onRetry={() => void versions.refetch()}
        skeleton={<ListSkeleton rows={3} />}
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            title="No versions yet"
            description={
              mayAuthor
                ? "Create a version to snapshot the curriculum before you change it."
                : "Curriculum versions will appear here once an author creates them."
            }
          />
        }
      >
        {(rows) => (
          <ul className="divide-y rounded-md border">
            {rows.map((version) => (
              <li
                key={version.id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{version.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {version.curriculum?.name ?? "—"}
                    {version.published_at
                      ? ` · published ${formatDateTime(version.published_at)}`
                      : ""}
                    {version.parent_version_id ? " · cloned" : ""}
                  </p>
                  {version.notes ? (
                    <p className="text-sm text-muted-foreground">{version.notes}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CurriculumStatusBadge status={version.status} />
                  {mayAuthor ? (
                    <>
                      <CloneVersionDialog
                        organizationId={organizationId}
                        versionId={version.id}
                        onSaved={refresh}
                        trigger={
                          <Button variant="outline" size="sm">
                            Clone
                          </Button>
                        }
                      />
                      <Button
                        size="sm"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({
                            versionId: version.id,
                            status: version.status === "published" ? "draft" : "published",
                          })
                        }
                      >
                        {version.status === "published" ? "Unpublish" : "Publish"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({
                            versionId: version.id,
                            status: version.status === "archived" ? "draft" : "archived",
                          })
                        }
                      >
                        {version.status === "archived" ? "Restore" : "Archive"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
