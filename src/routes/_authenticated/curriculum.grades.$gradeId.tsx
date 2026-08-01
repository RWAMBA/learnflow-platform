import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CurriculumStatusBadge } from "@/features/curriculum/components/status-badge";
import { SubjectFormDialog } from "@/features/curriculum/components/curriculum-dialogs";
import { curriculumKeys, getGradeWithContent } from "@/features/curriculum/api";
import { canAuthorCurriculum } from "@/features/roles/permissions";
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
  const organizationId = activeRole?.organizationId ?? "";

  const query = useQuery({
    queryKey: curriculumKeys.grade(gradeId),
    queryFn: () => getGradeWithContent(gradeId),
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: curriculumKeys.grade(gradeId) });

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
            {data.pathways.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Learning pathways</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {data.pathways.map((pathway) => (
                    <Badge key={pathway.id} variant="secondary">
                      {pathway.name}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            ) : null}

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
