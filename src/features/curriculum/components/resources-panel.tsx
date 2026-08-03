import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { ResourceFormDialog } from "@/features/curriculum/components/hierarchy-dialogs";
import {
  getResourceDownloadUrl,
  hierarchyKeys,
  listCurriculumResources,
  type ResourceEntity,
} from "@/features/curriculum/hierarchy-api";
import { deleteHierarchyItem } from "@/lib/curriculum-hierarchy.functions";

/** Learning resources attached to any curriculum entity. */
export function ResourcesPanel({
  organizationId,
  entityType,
  entityId,
  mayAuthor,
}: {
  organizationId: string;
  entityType: ResourceEntity;
  entityId: string;
  mayAuthor: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: hierarchyKeys.resources(entityType, entityId),
    queryFn: () => listCurriculumResources(entityType, entityId),
  });

  const refresh = () =>
    void queryClient.invalidateQueries({
      queryKey: hierarchyKeys.resources(entityType, entityId),
    });

  const removeItem = useServerFn(deleteHierarchyItem);
  const remove = useMutation({
    mutationFn: (id: string) =>
      removeItem({ data: { entity: "curriculum_resources", id, organizationId } }),
    onSuccess: () => {
      toast.success("Resource removed");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openStoredFile = async (storagePath: string) => {
    try {
      const url = await getResourceDownloadUrl(storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the file");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Learning resources</CardTitle>
        {mayAuthor && organizationId ? (
          <ResourceFormDialog
            organizationId={organizationId}
            entityType={entityType}
            entityId={entityId}
            onSaved={refresh}
            trigger={
              <Button size="sm" variant="outline">
                <Plus aria-hidden="true" className="size-4" /> Add resource
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
          skeleton={<ListSkeleton rows={2} />}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              title="No resources yet"
              description="Attach PDFs, videos, images, audio, documents or external links."
            />
          }
        >
          {(rows) => (
            <ul className="divide-y rounded-md border">
              {rows.map((resource) => (
                <li
                  key={resource.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{resource.title}</p>
                    <p className="text-xs uppercase text-muted-foreground">
                      {resource.resource_type}
                    </p>
                    {resource.description ? (
                      <p className="text-sm text-muted-foreground">{resource.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {resource.url ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={resource.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink aria-hidden="true" className="size-4" /> Open link
                        </a>
                      </Button>
                    ) : null}
                    {resource.storage_path ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void openStoredFile(resource.storage_path!)}
                      >
                        <Paperclip aria-hidden="true" className="size-4" /> Open file
                      </Button>
                    ) : null}
                    {mayAuthor ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(resource.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </CardContent>
    </Card>
  );
}
