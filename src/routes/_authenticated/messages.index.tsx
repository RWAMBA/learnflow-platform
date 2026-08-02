import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoleContext } from "@/features/roles/role-context";
import { useCurrentStudent } from "@/features/dashboard/use-viewer-students";
import { listAllowedContacts, listConversations, messagingKeys } from "@/features/messaging/api";
import { startConversation } from "@/lib/messaging.functions";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS, type RoleCode } from "@/features/roles/types";

export const Route = createFileRoute("/_authenticated/messages/")({
  head: () => ({
    meta: [
      { title: "Messages — the Platform" },
      {
        name: "description",
        content: "Conversations with the people connected to your students.",
      },
      { property: "og:title", content: "Messages — the Platform" },
      {
        property: "og:description",
        content: "Conversations with the people connected to your students.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { viewer, activeRole } = useRoleContext();
  const currentStudent = useCurrentStudent();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const userRoleId = activeRole?.userRoleId ?? "";

  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");

  const conversations = useQuery({
    queryKey: messagingKeys.conversations(userRoleId),
    queryFn: () => listConversations(userRoleId),
    enabled: Boolean(userRoleId),
  });

  const contacts = useQuery({
    queryKey: messagingKeys.contacts(viewer.userId, userRoleId),
    enabled:
      Boolean(activeRole) && (activeRole?.roleCode !== "student" || !currentStudent.isPending),
    queryFn: () =>
      listAllowedContacts({
        userId: viewer.userId,
        organizationId: activeRole!.organizationId,
        roleCode: activeRole!.roleCode,
        studentId: currentStudent.data?.id ?? null,
      }),
  });

  const create = useMutation({
    mutationFn: () =>
      startConversation({
        data: {
          organizationId: activeRole!.organizationId,
          senderUserRoleId: userRoleId,
          recipientUserRoleId: recipient,
          body,
        },
      }),
    onSuccess: (result) => {
      toast.success("Message sent");
      setOpen(false);
      setBody("");
      setRecipient("");
      void queryClient.invalidateQueries({ queryKey: messagingKeys.conversations(userRoleId) });
      void navigate({
        to: "/messages/$conversationId",
        params: { conversationId: result.conversationId },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = useMemo(() => {
    const list = conversations.data ?? [];
    const needle = term.trim().toLowerCase();
    return list
      .map((conversation) => {
        const messages = [...(conversation.messages ?? [])].sort((a, b) =>
          a.sent_at < b.sent_at ? 1 : -1,
        );
        const others = (conversation.participants ?? []).filter(
          (participant) => participant.user_role_id !== userRoleId,
        );
        const unread = messages.filter(
          (message) => message.sender_user_role_id !== userRoleId && !message.read_at,
        ).length;
        return { conversation, latest: messages[0], others, unread };
      })
      .filter((row) => {
        if (!needle) return true;
        const names = row.others
          .map((participant) => participant.user_role?.profile?.full_name ?? "")
          .join(" ")
          .toLowerCase();
        return names.includes(needle) || (row.latest?.body ?? "").toLowerCase().includes(needle);
      })
      .sort((a, b) => ((a.latest?.sent_at ?? "") < (b.latest?.sent_at ?? "") ? 1 : -1));
  }, [conversations.data, term, userRoleId]);

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Conversations with the people connected to your students."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>New message</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New message</DialogTitle>
                <DialogDescription>
                  You can message people connected to you through an active relationship.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Select value={recipient} onValueChange={setRecipient}>
                  <SelectTrigger aria-label="Recipient">
                    <SelectValue placeholder="Choose a recipient" />
                  </SelectTrigger>
                  <SelectContent>
                    {(contacts.data ?? []).map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.profile?.full_name ?? "Member"} —{" "}
                        {ROLE_LABELS[contact.role?.code as RoleCode] ??
                          contact.role?.name ??
                          "Member"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  aria-label="Message"
                  placeholder="Write your message"
                  rows={4}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => create.mutate()}
                  disabled={!recipient || !body.trim() || create.isPending}
                >
                  {create.isPending ? "Sending…" : "Send message"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Input
        aria-label="Search conversations"
        placeholder="Search by person or message"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        className="mb-4 sm:max-w-xs"
      />

      <QueryState
        isPending={conversations.isPending}
        error={conversations.error}
        data={rows}
        onRetry={() => void conversations.refetch()}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            description="Start a message with a parent, teacher, tutor or administrator."
          />
        }
      >
        {(data) => (
          <ul className="space-y-3">
            {data.map((row) => (
              <li key={row.conversation.id}>
                <Card>
                  <CardContent className="p-4">
                    <Link
                      to="/messages/$conversationId"
                      params={{ conversationId: row.conversation.id }}
                      className="flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {row.others
                            .map(
                              (participant) => participant.user_role?.profile?.full_name ?? "Member",
                            )
                            .join(", ") || "Conversation"}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {row.latest?.body ?? "No messages yet"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {row.unread > 0 ? <Badge>{row.unread} new</Badge> : null}
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(row.latest?.sent_at)}
                        </span>
                      </div>
                    </Link>
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
