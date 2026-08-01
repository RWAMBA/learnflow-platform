import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurriculumStatusBadge } from "@/features/curriculum/components/status-badge";
import {
  AssignPathwayDialog,
  PathwayFormDialog,
  SubjectFormDialog,
} from "@/features/curriculum/components/curriculum-dialogs";
import { curriculumKeys, getGradeWithContent } from "@/features/curriculum/api";
import { canAssignCurriculum, canAuthorCurriculum } from "@/features/roles/permissions";
import { setCurriculumStatus, deleteCurriculumItem } from "@/lib/curriculum.functions";
import { useRoleContext } from "@/features/roles/role-context";

export const Route = createFileRoute("/_authenticated/curriculum/grades/$gradeId")({
  head: () => ({
    meta: [
      { title: "Grade — the Platform" },
      { name: "description", content: "Pathways and subjects available in this grade." },
      { property: "og:title", content: "Grade — the Platform" },
      { property: "og:description", content: "Pathways and subjects available in this grade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GradePage,
});

function GradePage() {
  const { gradeId } = Route.useParams();
  const { activeRole } = useRoleContext();
  const queryClient = useQueryClient();
  const mayAuthor = canAuthorCurriculum(activeRole?.roleCode);
  const mayAssign = canAssignCurriculum(activeRole?.roleCode);
  const organizationId = activeRole?.organizationId ?? "";

  const query = useQuery({
    queryKey: curriculumKeys.grade(gradeId),
    queryFn: () => getGradeWithContent(gradeId),
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: curriculumKeys.grade(gradeId) });

  const changeStatus = useServerFn(setCurriculumStatus);
  const removeItem = useServerFn(deleteCurriculumItem);

  const pathwayStatus = useMutation({
    mutationFn: (input: { id: string; status: "draft" | "published" | "archived" }) =>
      changeStatus({
        data: { entity: "pathways", id: input.id, organizationId, status: input.status },
      }),
    onSuccess: () => {
      toast.success("Pathway status updated");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pathwayDelete = useMutation({
    mutationFn: (id: string) => removeItem({ data: { entity: "pathways", id, organizationId } }),
    onSuccess: () => {
      toast.success("Pathway removed");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title={query.data?.grade?.name ?? "Grade"}
        description="Pathways and subjects available in this grade."
        actions={
          mayAuthor && organizationId ? (
            <SubjectFormDialog
              organizationId={organizationId}
              gradeId={gradeId}
              pathways={query.data?.pathways ?? []}
              onSaved={refresh}
              trigger={
                <Button>
                  <Plus aria-hidden="true" className="size-4" /> New subject
                </Button>
              }
            />
          ) : undefined
        }
      />

      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        skeleton={<ListSkeleton rows={4} />}
      >
        {(data) => (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">Learning pathways</CardTitle>
                {mayAuthor && organizationId ? (
                  <PathwayFormDialog
                    organizationId={organizationId}
                    gradeId={gradeId}
                    onSaved={refresh}
                    trigger={
                      <Button size="sm" variant="outline">
                        <Plus aria-hidden="true" className="size-4" /> New pathway
                      </Button>
                    }
                  />
                ) : null}
              </CardHeader>
              <CardContent>
                {data.pathways.length === 0 ? (
                  <EmptyState
                    title="No pathways yet"
                    description={
                      mayAuthor
                        ? "Create a pathway to group the subjects learners follow."
                        : "Pathways will appear here once they are published."
                    }
                  />
                ) : (
                  <ul className="divide-y rounded-md border">
                    {data.pathways.map((pathway) => {
                      const owned =
                        mayAuthor && pathway.authoring_organization_id === organizationId;
                      return (
                        <li
                          key={pathway.id}
                          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="font-medium">{pathway.name}</p>
                            {pathway.description ? (
                              <p className="text-sm text-muted-foreground">{pathway.description}</p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <CurriculumStatusBadge status={pathway.status} />
                            {mayAssign && organizationId ? (
                              <AssignPathwayDialog
                                organizationId={organizationId}
                                pathwayId={pathway.id}
                                trigger={
                                  <Button variant="outline" size="sm">
                                    Assign
                                  </Button>
                                }
                              />
                            ) : null}
                            {owned ? (
                              <>
                                <PathwayFormDialog
                                  organizationId={organizationId}
                                  gradeId={gradeId}
                                  pathway={pathway}
                                  onSaved={refresh}
                                  trigger={
                                    <Button variant="outline" size="sm">
                                      Edit
                                    </Button>
                                  }
                                />
                                <Button
                                  size="sm"
                                  disabled={pathwayStatus.isPending}
                                  onClick={() =>
                                    pathwayStatus.mutate({
                                      id: pathway.id,
                                      status:
                                        pathway.status === "published" ? "draft" : "published",
                                    })
                                  }
                                >
                                  {pathway.status === "published" ? "Unpublish" : "Publish"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={pathwayDelete.isPending}
                                  onClick={() => pathwayDelete.mutate(pathway.id)}
                                >
                                  Remove
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Subjects</CardTitle>
              </CardHeader>
              <CardContent>
                {data.subjects.length === 0 ? (
                  <EmptyState
                    title="No subjects yet"
                    description={
                      mayAuthor
                        ? "Create the first subject for this grade."
                        : "Subjects will appear here once they are published."
                    }
                  />
                ) : (
                  <ul className="divide-y rounded-md border">
                    {data.subjects.map((subject) => (
                      <li
                        key={subject.id}
                        className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <Link
                          to="/curriculum/subjects/$subjectId"
                          params={{ subjectId: subject.id }}
                          className="font-medium hover:underline"
                        >
                          {subject.name}
                        </Link>
                        <div className="flex items-center gap-2">
                          {subject.code ? (
                            <span className="text-sm text-muted-foreground">{subject.code}</span>
                          ) : null}
                          <CurriculumStatusBadge status={subject.status} />
                          {mayAuthor && subject.authoring_organization_id === organizationId ? (
                            <SubjectFormDialog
                              organizationId={organizationId}
                              gradeId={gradeId}
                              pathways={data.pathways}
                              subject={subject}
                              onSaved={refresh}
                              trigger={
                                <Button variant="outline" size="sm">
                                  Edit
                                </Button>
                              }
                            />
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </QueryState>
    </div>
  );
}
