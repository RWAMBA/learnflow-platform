import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Plus, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurriculumStatusBadge } from "@/features/curriculum/components/status-badge";
import {
  AssignSubjectDialog,
  LessonFormDialog,
  TopicFormDialog,
} from "@/features/curriculum/components/curriculum-dialogs";
import { DuplicateSubjectDialog } from "@/features/curriculum/components/hierarchy-dialogs";
import { StrandsSection } from "@/features/curriculum/components/strands-section";
import { ResourcesPanel } from "@/features/curriculum/components/resources-panel";
import {
  curriculumKeys,
  getSubjectWithContent,
  listSubjectAssignments,
} from "@/features/curriculum/api";
import {
  canAssignCurriculum,
  canAuthorPlatformCurriculum,
  canAuthorTenantCurriculum,
} from "@/features/roles/permissions";
import { useRoleContext } from "@/features/roles/role-context";
import {
  deleteCurriculumItem,
  removeCurriculumAssignment,
  setCurriculumStatus,
} from "@/lib/curriculum.functions";

export const Route = createFileRoute("/_authenticated/curriculum/subjects/$subjectId")({
  head: () => ({
    meta: [
      { title: "Subject — the Platform" },
      { name: "description", content: "Topics, lessons and competencies for this subject." },
      { property: "og:title", content: "Subject — the Platform" },
      { property: "og:description", content: "Topics, lessons and competencies for this subject." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SubjectPage,
});

function SubjectPage() {
  const { subjectId } = Route.useParams();
  const { activeRole, viewer } = useRoleContext();
  const queryClient = useQueryClient();

  const organizationId = activeRole?.organizationId ?? "";

  const mayAssign = canAssignCurriculum(activeRole?.roleCode);

  const mayAuthorPlatform = canAuthorPlatformCurriculum(viewer.isPlatformAdmin);

  const mayAuthorTenant =
    canAuthorTenantCurriculum(activeRole?.roleCode) && Boolean(organizationId);

  const query = useQuery({
    queryKey: curriculumKeys.subject(subjectId),
    queryFn: () => getSubjectWithContent(subjectId),
  });

  const assignments = useQuery({
    queryKey: curriculumKeys.subjectAssignments(subjectId),
    enabled: mayAssign,
    queryFn: () => listSubjectAssignments(subjectId),
  });

  const mayCreateLesson = mayAuthorPlatform || mayAuthorTenant;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: curriculumKeys.subject(subjectId) });
    void queryClient.invalidateQueries({ queryKey: curriculumKeys.subjectAssignments(subjectId) });
  };

  const changeStatus = useServerFn(setCurriculumStatus);
  const removeItem = useServerFn(deleteCurriculumItem);
  const removeAssignment = useServerFn(removeCurriculumAssignment);

  const statusMutation = useMutation({
    mutationFn: (input: {
      entity: "topics" | "lessons";
      id: string;
      status: "draft" | "published" | "archived";
      organizationId?: string | null;
    }) => changeStatus({ data: input }),
    onSuccess: () => {
      toast.success("Status updated");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (input: {
      entity: "topics" | "lessons";
      id: string;
      organizationId?: string | null;
    }) => removeItem({ data: input }),
    onSuccess: () => {
      toast.success("Removed");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unassignMutation = useMutation({
    mutationFn: (id: string) => removeAssignment({ data: { id, organizationId } }),
    onSuccess: () => {
      toast.success("Assignment removed");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const topics = query.data?.topics ?? [];
  const lessons = query.data?.lessons ?? [];
  const nextTopicOrder = topics.length + 1;
  const nextLessonOrder = lessons.length + 1;

  return (
    <div>
      <PageHeader
        title={query.data?.subject?.name ?? "Subject"}
        description={query.data?.subject?.description ?? "Topics, lessons and competencies."}
        actions={
          <div className="flex flex-wrap gap-2">
            {mayAuthorPlatform ? (
              <>
                <TopicFormDialog
                  subjectId={subjectId}
                  nextOrder={nextTopicOrder}
                  onSaved={refresh}
                  trigger={
                    <Button variant="outline">
                      <Plus aria-hidden="true" className="size-4" /> New topic
                    </Button>
                  }
                />

                <LessonFormDialog
                  organizationId={null}
                  authorType="platform"
                  subjectId={subjectId}
                  topics={topics}
                  nextOrder={nextLessonOrder}
                  onSaved={refresh}
                  trigger={
                    <Button>
                      <Plus aria-hidden="true" className="size-4" /> New platform lesson
                    </Button>
                  }
                />
              </>
            ) : null}

            {mayAuthorTenant && organizationId ? (
              <LessonFormDialog
                organizationId={organizationId}
                authorType="tenant"
                subjectId={subjectId}
                topics={topics}
                nextOrder={nextLessonOrder}
                onSaved={refresh}
                trigger={
                  <Button variant="outline">
                    <Plus aria-hidden="true" className="size-4" /> New organization lesson
                  </Button>
                }
              />
            ) : null}
            {mayAssign && organizationId ? (
              <AssignSubjectDialog
                organizationId={organizationId}
                subjectId={subjectId}
                onSaved={refresh}
                trigger={
                  <Button variant="secondary">
                    <UserPlus aria-hidden="true" className="size-4" /> Assign to students
                  </Button>
                }
              />
            ) : null}
            {mayAuthorPlatform ? (
              <DuplicateSubjectDialog
                subjectId={subjectId}
                defaultName={query.data?.subject?.name ?? "Subject"}
                onSaved={refresh}
                trigger={
                  <Button variant="outline">
                    <Copy aria-hidden="true" className="size-4" /> Duplicate
                  </Button>
                }
              />
            ) : null}
          </div>
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
            <div className="flex flex-wrap items-center gap-2">
              <CurriculumStatusBadge status={data.subject?.status} />
              {data.subject?.grade ? (
                <Link
                  to="/curriculum/grades/$gradeId"
                  params={{ gradeId: data.subject.grade.id }}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  {data.subject.grade.name}
                </Link>
              ) : null}
              {data.subject?.pathway ? (
                <Badge variant="secondary">{data.subject.pathway.name}</Badge>
              ) : null}
            </div>

            <StrandsSection
              subjectId={subjectId}
              competencies={data.competencies ?? []}
              mayAuthor={mayAuthorPlatform}
            />

            <ResourcesPanel
              organizationId={organizationId}
              entityType="subject"
              entityId={subjectId}
              mayAuthor={mayAuthorTenant}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Curriculum hierarchy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {topics.length === 0 && lessons.length === 0 ? (
                  <EmptyState
                    title="Nothing here yet"
                    description={
                      mayCreateLesson
                        ? "Add a topic or lesson to begin building this subject."
                        : "Topics and lessons will appear once published."
                    }
                  />
                ) : null}

                {topics.map((topic) => {
                  const topicLessons = lessons.filter((lesson) => lesson.topic_id === topic.id);
                  return (
                    <section key={topic.id} className="rounded-lg border p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h2 className="font-medium">
                            {topic.sequence_order}. {topic.title}
                          </h2>
                          {topic.description ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {topic.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <CurriculumStatusBadge status={topic.status} />
                          {mayAuthorPlatform && topic.authoring_organization_id === null ? (
                            <>
                              <TopicFormDialog
                                subjectId={subjectId}
                                topic={topic}
                                nextOrder={nextTopicOrder}
                                onSaved={refresh}
                                trigger={
                                  <Button variant="outline" size="sm">
                                    Edit
                                  </Button>
                                }
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={statusMutation.isPending}
                                onClick={() =>
                                  statusMutation.mutate({
                                    entity: "topics",
                                    id: topic.id,
                                    status: topic.status === "published" ? "draft" : "published",
                                  })
                                }
                              >
                                {topic.status === "published" ? "Unpublish" : "Publish"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={deleteMutation.isPending}
                                onClick={() =>
                                  deleteMutation.mutate({ entity: "topics", id: topic.id })
                                }
                              >
                                Delete
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <LessonList
                        lessons={topicLessons}
                        organizationId={organizationId}
                        subjectId={subjectId}
                        topics={topics}
                        mayAuthorPlatform={mayAuthorPlatform}
                        mayAuthorTenant={mayAuthorTenant}
                        onRefresh={refresh}
                        onStatus={(id, status, auditOrganizationId) =>
                          statusMutation.mutate({
                            entity: "lessons",
                            id,
                            status,
                            organizationId: auditOrganizationId,
                          })
                        }
                        onDelete={(id, auditOrganizationId) =>
                          deleteMutation.mutate({
                            entity: "lessons",
                            id,
                            organizationId: auditOrganizationId,
                          })
                        }
                      />
                    </section>
                  );
                })}

                {(() => {
                  const unsorted = lessons.filter((lesson) => !lesson.topic_id);
                  if (unsorted.length === 0) return null;
                  return (
                    <section className="rounded-lg border p-4">
                      <h2 className="font-medium">Lessons without a topic</h2>
                      <LessonList
                        lessons={unsorted}
                        organizationId={organizationId}
                        subjectId={subjectId}
                        topics={topics}
                        mayAuthorPlatform={mayAuthorPlatform}
                        mayAuthorTenant={mayAuthorTenant}
                        onRefresh={refresh}
                        onStatus={(id, status, auditOrganizationId) =>
                          statusMutation.mutate({
                            entity: "lessons",
                            id,
                            status,
                            organizationId: auditOrganizationId,
                          })
                        }
                        onDelete={(id, auditOrganizationId) =>
                          deleteMutation.mutate({
                            entity: "lessons",
                            id,
                            organizationId: auditOrganizationId,
                          })
                        }
                      />
                    </section>
                  );
                })()}
              </CardContent>
            </Card>

            {data.competencies.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Competencies</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {data.competencies.map((competency) => (
                      <li key={competency.id} className="rounded-md border p-3">
                        <p className="font-medium">{competency.name}</p>
                        {competency.description ? (
                          <p className="text-sm text-muted-foreground">{competency.description}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {mayAssign ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Assigned students</CardTitle>
                </CardHeader>
                <CardContent>
                  <QueryState
                    isPending={assignments.isPending}
                    error={assignments.error}
                    data={assignments.data ?? []}
                    onRetry={() => void assignments.refetch()}
                    skeleton={<ListSkeleton rows={2} />}
                    isEmpty={(rows) => rows.length === 0}
                    empty={
                      <EmptyState
                        title="Not assigned yet"
                        description="Assign this subject to students so it appears in their curriculum."
                      />
                    }
                  >
                    {(rows) => (
                      <ul className="divide-y rounded-md border">
                        {rows.map((row) => (
                          <li key={row.id} className="flex items-center justify-between p-3">
                            <Link
                              to="/students/$studentId"
                              params={{ studentId: row.student!.id }}
                              className="hover:underline"
                            >
                              {row.student?.first_name} {row.student?.last_name}
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={unassignMutation.isPending}
                              onClick={() => unassignMutation.mutate(row.id)}
                            >
                              Remove
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </QueryState>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </QueryState>
    </div>
  );
}

interface LessonRow {
  id: string;
  title: string;
  sequence_order: number;
  content_type: string;
  status: string;
  topic_id: string | null;
  author_type: string;
  authoring_organization_id: string | null;
}

function LessonList({
  lessons,
  organizationId,
  subjectId,
  topics,
  mayAuthorPlatform,
  mayAuthorTenant,
  onRefresh,
  onStatus,
  onDelete,
}: {
  lessons: LessonRow[];
  organizationId: string;
  subjectId: string;
  topics: { id: string; title: string }[];
  mayAuthorPlatform: boolean;
  mayAuthorTenant: boolean;
  onRefresh: () => void;
  onStatus: (id: string, status: "draft" | "published", auditOrganizationId: string | null) => void;
  onDelete: (id: string, auditOrganizationId: string | null) => void;
}) {
  if (lessons.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">No lessons in this topic yet.</p>;
  }
  return (
    <ul className="mt-3 divide-y rounded-md border">
      {lessons.map((lesson) => (
        <li
          key={lesson.id}
          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <Link
            to="/curriculum/lessons/$lessonId"
            params={{ lessonId: lesson.id }}
            className="font-medium hover:underline"
          >
            {lesson.sequence_order}. {lesson.title}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase text-muted-foreground">{lesson.content_type}</span>
            <CurriculumStatusBadge status={lesson.status} />
            {(mayAuthorPlatform &&
              lesson.author_type === "platform" &&
              lesson.authoring_organization_id === null) ||
            (mayAuthorTenant &&
              Boolean(organizationId) &&
              lesson.author_type === "tenant" &&
              lesson.authoring_organization_id === organizationId) ? (
              <>
                <LessonFormDialog
                  organizationId={lesson.author_type === "tenant" ? organizationId : null}
                  authorType={lesson.author_type === "platform" ? "platform" : "tenant"}
                  subjectId={subjectId}
                  topics={topics}
                  lesson={lesson}
                  nextOrder={lesson.sequence_order}
                  onSaved={onRefresh}
                  trigger={
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  }
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onStatus(
                      lesson.id,
                      lesson.status === "published" ? "draft" : "published",
                      lesson.author_type === "tenant" ? organizationId : null,
                    )
                  }
                >
                  {lesson.status === "published" ? "Unpublish" : "Publish"}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onDelete(lesson.id, lesson.author_type === "tenant" ? organizationId : null)
                  }
                >
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
