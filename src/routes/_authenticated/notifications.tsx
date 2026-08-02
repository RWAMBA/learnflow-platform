import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryState } from "@/components/shared/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRoleContext } from "@/features/roles/role-context";
import {
  NOTIFICATION_LABELS,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
} from "@/features/notifications/api";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — the Platform" },
      { name: "description", content: "Everything that needs your attention." },
      { property: "og:title", content: "Notifications — the Platform" },
      { property: "og:description", content: "Everything that needs your attention." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function targetOf(type: string, payload: unknown) {
  const data = (payload ?? {}) as { assignment_id?: string; conversation_id?: string };
  if (data.assignment_id) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/assignments/$assignmentId" params={{ assignmentId: data.assignment_id }}>
          Open assignment
        </Link>
      </Button>
    );
  }
  if (data.conversation_id) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/messages/$conversationId" params={{ conversationId: data.conversation_id }}>
          Open conversation
        </Link>
      </Button>
    );
  }
  return null;
}

function Page() {
  const { viewer } = useRoleContext();
  const userRoleIds = viewer.roles.map((role) => role.userRoleId);

  const query = useQuery({
    queryKey: notificationKeys.list(userRoleIds),
    enabled: userRoleIds.length > 0,
    queryFn: () => listNotifications(userRoleIds),
  });

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => void query.refetch(),
    onError: () => toast.error("Could not mark that as read"),
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(userRoleIds),
    onSuccess: () => {
      toast.success("All caught up");
      void query.refetch();
    },
    onError: () => toast.error("Could not mark these as read"),
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Everything that needs your attention."
        actions={
          <Button
            variant="outline"
            disabled={markAll.isPending || !query.data?.some((row) => !row.read_at)}
            onClick={() => markAll.mutate()}
          >
            Mark all as read
          </Button>
        }
      />

      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={BellRing}
            title="Nothing to see yet"
            description="Assignment, grading and message alerts will show up here."
          />
        }
      >
        {(data) => (
          <ul className="space-y-3">
            {data.map((row) => (
              <li key={row.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {NOTIFICATION_LABELS[row.type] ?? row.type}
                        </span>
                        {row.read_at ? null : <Badge variant="secondary">New</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(row.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {targetOf(row.type, row.payload)}
                      {row.read_at ? null : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={markOne.isPending}
                          onClick={() => markOne.mutate(row.id)}
                        >
                          Mark read
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
