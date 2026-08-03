import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { CurriculumStatusBadge } from "@/features/curriculum/components/status-badge";
import {
  LearningOutcomeFormDialog,
  StrandFormDialog,
  SubStrandFormDialog,
} from "@/features/curriculum/components/hierarchy-dialogs";
import { hierarchyKeys, listStrands } from "@/features/curriculum/hierarchy-api";
import { deleteHierarchyItem, setHierarchyStatus } from "@/lib/curriculum-hierarchy.functions";

/**
 * Strand → sub-strand → learning outcome tree for a subject, with authoring
 * controls for the organization that owns each node.
 */
export function StrandsSection({
  organizationId,
  subjectId,
  competencies,
  mayAuthor,
}: {
  organizationId: string;
  subjectId: string;
  competencies: { id: string; name: string }[];
  mayAuthor: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: hierarchyKeys.strands(subjectId),
    queryFn: () => listStrands(subjectId),
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: hierarchyKeys.strands(subjectId) });

  const changeStatus = useServerFn(setHierarchyStatus);
  const removeItem = useServerFn(deleteHierarchyItem);

  const statusMutation = useMutation({
    mutationFn: (input: {
      entity: "strands" | "sub_strands" | "learning_outcomes";
      id: string;
      status: "draft" | "review" | "published" | "archived";
    }) => changeStatus({ data: { ...input, organizationId } }),
    onSuccess: () => {
      toast.success("Status updated");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (input: {
      entity: "strands" | "sub_strands" | "learning_outcomes";
      id: string;
    }) => removeItem({ data: { ...input, organizationId } }),
    onSuccess: () => {
      toast.success("Removed");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const strands = query.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Strands &amp; learning outcomes</CardTitle>
        {mayAuthor && organizationId ? (
          <StrandFormDialog
            organizationId={organizationId}
            subjectId={subjectId}
            nextOrder={strands.length + 1}
            onSaved={refresh}
            trigger={
              <Button size="sm" variant="outline">
                <Plus aria-hidden="true" className="size-4" /> New strand
              </Button>
            }
          />
        ) : null}
      </CardHeader>
      <CardContent>
        <QueryState
          isPending={query.isPending}
          error={query.error}
          data={query.data}
          onRetry={() => void query.refetch()}
          skeleton={<ListSkeleton rows={3} />}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              title="No strands yet"
              description={
                mayAuthor
                  ? "Strands organise a subject into sub-strands and learning outcomes."
                  : "Strands will appear here once they are published."
              }
            />
          }
        >
          {(rows) => (
            <div className="space-y-5">
              {rows.map((strand) => {
                const ownsStrand =
                  mayAuthor && strand.authoring_organization_id === organizationId;
                return (
                  <section key={strand.id} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-medium">
                          {strand.sequence_order}. {strand.title}
                        </h3>
                        {strand.description ? (
                          <p className="mt-1 text-sm text-muted-foreground">{strand.description}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CurriculumStatusBadge status={strand.status} />
                        {ownsStrand ? (
                          <>
                            <SubStrandFormDialog
                              organizationId={organizationId}
                              strandId={strand.id}
                              nextOrder={(strand.sub_strands?.length ?? 0) + 1}
                              onSaved={refresh}
                              trigger={
                                <Button size="sm" variant="outline">
                                  <Plus aria-hidden="true" className="size-4" /> Sub-strand
                                </Button>
                              }
                            />
                            <StrandFormDialog
                              organizationId={organizationId}
                              subjectId={subjectId}
                              strand={strand}
                              nextOrder={strand.sequence_order}
                              onSaved={refresh}
                              trigger={
                                <Button size="sm" variant="outline">
                                  Edit
                                </Button>
                              }
                            />
                            <Button
                              size="sm"
                              disabled={statusMutation.isPending}
                              onClick={() =>
                                statusMutation.mutate({
                                  entity: "strands",
                                  id: strand.id,
                                  status: strand.status === "published" ? "draft" : "published",
                                })
                              }
                            >
                              {strand.status === "published" ? "Unpublish" : "Publish"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deleteMutation.isPending}
                              onClick={() =>
                                deleteMutation.mutate({ entity: "strands", id: strand.id })
                              }
                            >
                              Remove
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {(strand.sub_strands ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No sub-strands yet.</p>
                      ) : null}
                      {(strand.sub_strands ?? []).map((sub) => {
                        const ownsSub =
                          mayAuthor && sub.authoring_organization_id === organizationId;
                        return (
                          <div key={sub.id} className="rounded-md border p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <p className="font-medium">
                                {sub.sequence_order}. {sub.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                <CurriculumStatusBadge status={sub.status} />
                                {ownsSub ? (
                                  <>
                                    <LearningOutcomeFormDialog
                                      organizationId={organizationId}
                                      subStrandId={sub.id}
                                      competencies={competencies}
                                      nextOrder={(sub.learning_outcomes?.length ?? 0) + 1}
                                      onSaved={refresh}
                                      trigger={
                                        <Button size="sm" variant="outline">
                                          <Plus aria-hidden="true" className="size-4" /> Outcome
                                        </Button>
                                      }
                                    />
                                    <SubStrandFormDialog
                                      organizationId={organizationId}
                                      strandId={strand.id}
                                      subStrand={sub}
                                      nextOrder={sub.sequence_order}
                                      onSaved={refresh}
                                      trigger={
                                        <Button size="sm" variant="outline">
                                          Edit
                                        </Button>
                                      }
                                    />
                                    <Button
                                      size="sm"
                                      disabled={statusMutation.isPending}
                                      onClick={() =>
                                        statusMutation.mutate({
                                          entity: "sub_strands",
                                          id: sub.id,
                                          status:
                                            sub.status === "published" ? "draft" : "published",
                                        })
                                      }
                                    >
                                      {sub.status === "published" ? "Unpublish" : "Publish"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={deleteMutation.isPending}
                                      onClick={() =>
                                        deleteMutation.mutate({
                                          entity: "sub_strands",
                                          id: sub.id,
                                        })
                                      }
                                    >
                                      Remove
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            {(sub.learning_outcomes ?? []).length > 0 ? (
                              <ol className="mt-3 space-y-2">
                                {(sub.learning_outcomes ?? []).map((outcome) => (
                                  <li
                                    key={outcome.id}
                                    className="flex flex-col gap-2 rounded-md bg-muted/40 p-2 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div>
                                      <p className="text-sm">{outcome.description}</p>
                                      {outcome.competency ? (
                                        <p className="text-xs text-muted-foreground">
                                          Competency: {outcome.competency.name}
                                        </p>
                                      ) : null}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <CurriculumStatusBadge status={outcome.status} />
                                      {ownsSub ? (
                                        <>
                                          <LearningOutcomeFormDialog
                                            organizationId={organizationId}
                                            subStrandId={sub.id}
                                            competencies={competencies}
                                            outcome={outcome}
                                            nextOrder={outcome.sequence_order}
                                            onSaved={refresh}
                                            trigger={
                                              <Button size="sm" variant="outline">
                                                Edit
                                              </Button>
                                            }
                                          />
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={deleteMutation.isPending}
                                            onClick={() =>
                                              deleteMutation.mutate({
                                                entity: "learning_outcomes",
                                                id: outcome.id,
                                              })
                                            }
                                          >
                                            Remove
                                          </Button>
                                        </>
                                      ) : null}
                                    </div>
                                  </li>
                                ))}
                              </ol>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </QueryState>
      </CardContent>
    </Card>
  );
}
