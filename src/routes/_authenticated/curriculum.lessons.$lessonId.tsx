import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurriculumStatusBadge } from "@/features/curriculum/components/status-badge";
import {
  LessonFormDialog,
  ObjectiveFormDialog,
  RecordProgressDialog,
} from "@/features/curriculum/components/curriculum-dialogs";
import { curriculumKeys, getLesson, getSubjectWithContent } from "@/features/curriculum/api";
import {
  findLessonNeighbours,
  hierarchyKeys,
  listLessonPrerequisites,
  listSubjectLessonSequence,
} from "@/features/curriculum/hierarchy-api";
import { LessonPlanningDialog } from "@/features/curriculum/components/hierarchy-dialogs";
import { ResourcesPanel } from "@/features/curriculum/components/resources-panel";
import { canAssignCurriculum, canAuthorCurriculum } from "@/features/roles/permissions";
import { useRoleContext } from "@/features/roles/role-context";
import { deleteCurriculumItem, setCurriculumStatus } from "@/lib/curriculum.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/curriculum/lessons/$lessonId")({
  head: () => ({
    meta: [
      { title: "Lesson — the Platform" },
      { name: "description", content: "Lesson content, learning objectives and materials." },
      { property: "og:title", content: "Lesson — the Platform" },
      { property: "og:description", content: "Lesson content, learning objectives and materials." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LessonPage,
});

function LessonPage() {
  const { lessonId } = Route.useParams();
  const { activeRole } = useRoleContext();
  const queryClient = useQueryClient();
  const organizationId = activeRole?.organizationId ?? "";

  const query = useQuery({
    queryKey: curriculumKeys.lesson(lessonId),
    queryFn: () => getLesson(lessonId),
  });

  const subjectId = query.data?.lesson?.subject?.id ?? "";
  const subjectContent = useQuery({
    queryKey: curriculumKeys.subject(subjectId),
    enabled: Boolean(subjectId),
    queryFn: () => getSubjectWithContent(subjectId),
  });

  const sequence = useQuery({
    queryKey: hierarchyKeys.sequence(subjectId),
    enabled: Boolean(subjectId),
    queryFn: () => listSubjectLessonSequence(subjectId),
  });

  const prerequisites = useQuery({
    queryKey: hierarchyKeys.prerequisites(lessonId),
    queryFn: () => listLessonPrerequisites(lessonId),
  });

  const neighbours = findLessonNeighbours(sequence.data ?? [], lessonId);

  const mayAuthor =
    canAuthorCurriculum(activeRole?.roleCode) &&
    Boolean(organizationId) &&
    query.data?.lesson?.authoring_organization_id === organizationId;

  const mayRecordProgress = canAssignCurriculum(activeRole?.roleCode) && Boolean(organizationId);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: curriculumKeys.lesson(lessonId) });
    void queryClient.invalidateQueries({ queryKey: hierarchyKeys.prerequisites(lessonId) });
  };

  const changeStatus = useServerFn(setCurriculumStatus);
  const removeItem = useServerFn(deleteCurriculumItem);

  const statusMutation = useMutation({
    mutationFn: (status: "draft" | "published" | "archived") =>
      changeStatus({ data: { entity: "lessons", id: lessonId, organizationId, status } }),
    onSuccess: () => {
      toast.success("Publishing status updated");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteObjective = useMutation({
    mutationFn: (id: string) =>
      removeItem({ data: { entity: "learning_objectives", id, organizationId } }),
    onSuccess: () => {
      toast.success("Objective removed");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lesson = query.data?.lesson;
  const body =
    lesson?.content_body && typeof lesson.content_body === "object"
      ? ((lesson.content_body as { body?: string }).body ?? "")
      : "";

  return (
    <div>
      <PageHeader
        title={lesson?.title ?? "Lesson"}
        description={
          lesson?.subject?.name
            ? `${lesson.subject.name} · ${lesson.subject.grade?.name ?? ""}`
            : undefined
        }
        actions={
          lesson && (mayAuthor || mayRecordProgress) ? (
            <div className="flex flex-wrap gap-2">
              {mayRecordProgress ? (
                <RecordProgressDialog
                  organizationId={organizationId}
                  lessonId={lesson.id}
                  trigger={<Button variant="outline">Record progress</Button>}
                />
              ) : null}
              {mayAuthor ? (
                <>
                  <LessonPlanningDialog
                    organizationId={organizationId}
                    lessonId={lesson.id}
                    lesson={{
                      summary: lesson.summary ?? null,
                      estimated_minutes: lesson.estimated_minutes ?? null,
                    }}
                    siblingLessons={sequence.data ?? []}
                    currentPrerequisiteId={prerequisites.data?.[0]?.prerequisite_lesson_id ?? null}
                    onSaved={refresh}
                    trigger={<Button variant="outline">Lesson planning</Button>}
                  />
                  <LessonFormDialog
                    organizationId={organizationId}
                    subjectId={lesson.subject!.id}
                    topics={subjectContent.data?.topics ?? []}
                    lesson={{
                      id: lesson.id,
                      title: lesson.title,
                      topic_id: lesson.topic_id,
                      sequence_order: lesson.sequence_order,
                      content_type: lesson.content_type,
                      status: lesson.status,
                      content_body: lesson.content_body,
                    }}
                    nextOrder={lesson.sequence_order}
                    onSaved={refresh}
                    trigger={<Button variant="outline">Edit lesson</Button>}
                  />
                  <Button
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate(lesson.status === "published" ? "draft" : "published")
                    }
                  >
                    {lesson.status === "published" ? "Unpublish" : "Publish"}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={statusMutation.isPending || lesson.status === "archived"}
                    onClick={() => statusMutation.mutate("archived")}
                  >
                    Archive
                  </Button>
                </>
              ) : null}
            </div>
          ) : undefined
        }
      />

      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        skeleton={<ListSkeleton rows={3} />}
      >
        {(data) =>
          !data.lesson ? (
            <EmptyState title="Lesson not found" description="This lesson may have been removed." />
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <CurriculumStatusBadge status={data.lesson.status} />
                <span className="text-xs uppercase text-muted-foreground">
                  {data.lesson.content_type}
                </span>
                {data.lesson.published_at ? (
                  <span className="text-sm text-muted-foreground">
                    Published {formatDateTime(data.lesson.published_at)}
                  </span>
                ) : null}
                {data.lesson.subject ? (
                  <Link
                    to="/curriculum/subjects/$subjectId"
                    params={{ subjectId: data.lesson.subject.id }}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Back to {data.lesson.subject.name}
                  </Link>
                ) : null}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Lesson content</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.lesson.summary ? (
                    <p className="mb-3 rounded-md bg-muted/50 p-3 text-sm">{data.lesson.summary}</p>
                  ) : null}
                  {data.lesson.estimated_minutes ? (
                    <p className="mb-3 text-sm text-muted-foreground">
                      Estimated completion time: {data.lesson.estimated_minutes} minutes
                    </p>
                  ) : null}
                  {(prerequisites.data ?? []).length > 0 ? (
                    <p className="mb-3 text-sm text-muted-foreground">
                      Prerequisite:{" "}
                      {(prerequisites.data ?? [])
                        .map((row) => row.prerequisite?.title)
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  ) : null}
                  {body ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{body}</p>
                  ) : (
                    <p className="text-muted-foreground">
                      No content has been added to this lesson yet.
                    </p>
                  )}
                  {data.lesson.storage_path ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Attached material: {data.lesson.storage_path}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <div className="flex flex-wrap items-center justify-between gap-2">
                {neighbours.previous ? (
                  <Button asChild variant="outline">
                    <Link
                      to="/curriculum/lessons/$lessonId"
                      params={{ lessonId: neighbours.previous.id }}
                    >
                      <ChevronLeft aria-hidden="true" className="size-4" />
                      {neighbours.previous.title}
                    </Link>
                  </Button>
                ) : (
                  <span />
                )}
                {neighbours.next ? (
                  <Button asChild variant="outline">
                    <Link
                      to="/curriculum/lessons/$lessonId"
                      params={{ lessonId: neighbours.next.id }}
                    >
                      {neighbours.next.title}
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>

              <ResourcesPanel
                organizationId={organizationId}
                entityType="lesson"
                entityId={lessonId}
                mayAuthor={mayAuthor}
              />

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <CardTitle className="text-base">Learning objectives</CardTitle>
                  {mayAuthor ? (
                    <ObjectiveFormDialog
                      organizationId={organizationId}
                      lessonId={lessonId}
                      competencies={subjectContent.data?.competencies ?? []}
                      nextOrder={data.objectives.length + 1}
                      onSaved={refresh}
                      trigger={
                        <Button size="sm" variant="outline">
                          <Plus aria-hidden="true" className="size-4" /> Add objective
                        </Button>
                      }
                    />
                  ) : null}
                </CardHeader>
                <CardContent>
                  {data.objectives.length === 0 ? (
                    <EmptyState
                      title="No objectives yet"
                      description="Learning objectives describe what the learner should master."
                    />
                  ) : (
                    <ol className="space-y-2">
                      {data.objectives.map((objective) => (
                        <li
                          key={objective.id}
                          className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p>{objective.description}</p>
                            {objective.competency ? (
                              <p className="text-sm text-muted-foreground">
                                Competency: {objective.competency.name}
                              </p>
                            ) : null}
                          </div>
                          {mayAuthor ? (
                            <div className="flex gap-2">
                              <ObjectiveFormDialog
                                organizationId={organizationId}
                                lessonId={lessonId}
                                competencies={subjectContent.data?.competencies ?? []}
                                objective={objective}
                                nextOrder={objective.sequence_order}
                                onSaved={refresh}
                                trigger={
                                  <Button variant="outline" size="sm">
                                    Edit
                                  </Button>
                                }
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={deleteObjective.isPending}
                                onClick={() => deleteObjective.mutate(objective.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>
          )
        }
      </QueryState>
    </div>
  );
}
