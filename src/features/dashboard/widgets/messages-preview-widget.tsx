import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryState, ListSkeleton } from "@/components/shared/query-state";
import { listConversations, messagingKeys } from "@/features/messaging/api";
import { useRoleContext } from "@/features/roles/role-context";
import { formatDateTime } from "@/lib/format";
import { WidgetCard } from "./widget-card";

export function MessagesPreviewWidget() {
  const { activeRole } = useRoleContext();
  const userRoleId = activeRole?.userRoleId ?? "";

  const query = useQuery({
    queryKey: messagingKeys.conversations(userRoleId),
    queryFn: () => listConversations(userRoleId),
    enabled: Boolean(userRoleId),
  });

  return (
    <WidgetCard
      title="Messages"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/messages">Open</Link>
        </Button>
      }
    >
      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        skeleton={<ListSkeleton rows={2} />}
        isEmpty={(data) => data.length === 0}
        empty={<EmptyState title="No conversations yet" description="Messages appear here once a conversation starts." />}
      >
        {(conversations) => (
          <ul className="space-y-3">
            {conversations.slice(0, 4).map((conversation) => {
              const latest = [...(conversation.messages ?? [])].sort((a, b) =>
                a.sent_at < b.sent_at ? 1 : -1,
              )[0];
              const others = (conversation.participants ?? []).filter(
                (participant) => participant.user_role_id !== userRoleId,
              );
              return (
                <li key={conversation.id}>
                  <Link
                    to="/messages/$conversationId"
                    params={{ conversationId: conversation.id }}
                    className="block rounded-md p-2 transition-colors duration-200 hover:bg-accent"
                  >
                    <span className="block font-medium">
                      {others[0]?.user_role?.profile?.full_name ?? "Conversation"}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {latest?.body ?? "No messages yet"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(latest?.sent_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </WidgetCard>
  );
}
