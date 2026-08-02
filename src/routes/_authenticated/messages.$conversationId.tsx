import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRoleContext } from "@/features/roles/role-context";
import { listMessages, markConversationRead, messagingKeys } from "@/features/messaging/api";
import { sendMessage } from "@/lib/messaging.functions";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS, type RoleCode } from "@/features/roles/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/messages/$conversationId")({
  head: () => ({
    meta: [
      { title: "Conversation — the Platform" },
      { name: "description", content: "Read and reply to this conversation." },
      { property: "og:title", content: "Conversation — the Platform" },
      { property: "og:description", content: "Read and reply to this conversation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { conversationId } = Route.useParams();
  const { activeRole } = useRoleContext();
  const queryClient = useQueryClient();
  const userRoleId = activeRole?.userRoleId ?? "";
  const [body, setBody] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: messagingKeys.messages(conversationId),
    queryFn: () => listMessages(conversationId),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!userRoleId || !query.data?.length) return;
    void markConversationRead(conversationId, userRoleId).then(() =>
      queryClient.invalidateQueries({ queryKey: messagingKeys.conversations(userRoleId) }),
    );
  }, [conversationId, userRoleId, query.data, queryClient]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [query.data]);

  const send = useMutation({
    mutationFn: () => sendMessage({ data: { conversationId, senderUserRoleId: userRoleId, body } }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: messagingKeys.messages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversations(userRoleId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="Conversation"
        description="Read and reply to this conversation."
        actions={
          <Button asChild variant="outline">
            <Link to="/messages">
              <ArrowLeft aria-hidden="true" className="mr-1 size-4" />
              All messages
            </Link>
          </Button>
        }
      />

      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
      >
        {(messages) => (
          <ul className="space-y-3" aria-live="polite">
            {messages.map((message) => {
              const mine = message.sender_user_role_id === userRoleId;
              return (
                <li key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-4 py-3 sm:max-w-[70%]",
                      mine ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    <p className="text-xs font-medium opacity-80">
                      {mine
                        ? "You"
                        : `${message.sender?.profile?.full_name ?? "Member"} · ${
                            ROLE_LABELS[message.sender?.role?.code as RoleCode] ??
                            message.sender?.role?.name ??
                            "Member"
                          }`}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
                    <p className="mt-1 text-xs opacity-70">{formatDateTime(message.sent_at)}</p>
                  </div>
                </li>
              );
            })}
            <div ref={endRef} />
          </ul>
        )}
      </QueryState>

      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim()) send.mutate();
        }}
      >
        <Textarea
          aria-label="Write a reply"
          placeholder="Write a reply"
          rows={2}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <Button type="submit" disabled={!body.trim() || send.isPending} className="sm:self-end">
          {send.isPending ? "Sending…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
