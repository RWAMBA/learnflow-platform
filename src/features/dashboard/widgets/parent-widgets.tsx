import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GraduationCap, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { listLinkedStudentsForParent, studentKeys } from "@/features/students/api";
import { listPendingInvitationsForUser, relationshipKeys } from "@/features/relationships/api";
import { respondToInvitation } from "@/lib/relationships.functions";
import { WidgetCard } from "./widget-card";

export function ChildrenWidget({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: studentKeys.forViewer(userId),
    queryFn: () => listLinkedStudentsForParent(userId),
  });

  return (
    <WidgetCard
      title="Your students"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/students">Manage</Link>
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
        empty={
          <EmptyState
            icon={GraduationCap}
            title="No students linked yet"
            description="Add a student to start tracking assignments and progress."
            action={
              <Button asChild size="sm">
                <Link to="/students/new">Add a student</Link>
              </Button>
            }
          />
        }
      >
        {(links) => (
          <ul className="grid gap-2 sm:grid-cols-2">
            {links.map((link) => (
              <li key={link.id}>
                <Link
                  to="/students/$studentId"
                  params={{ studentId: link.student!.id }}
                  className="block rounded-lg border p-3 transition-colors duration-200 hover:bg-accent"
                >
                  <span className="block font-medium">
                    {link.student?.first_name} {link.student?.last_name}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {link.student?.grade?.name ?? "No grade set"} · {link.permission_level}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </WidgetCard>
  );
}

export function PendingInvitationsWidget({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const respond = useServerFn(respondToInvitation);

  const query = useQuery({
    queryKey: relationshipKeys.pendingForUser(userId),
    queryFn: () => listPendingInvitationsForUser(userId),
  });

  const mutation = useMutation({
    mutationFn: (input: { kind: "parent" | "teacher" | "tutor"; relationshipId: string; accept: boolean }) =>
      respond({ data: input }),
    onSuccess: async () => {
      toast.success("Invitation updated.");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <WidgetCard title="Invitations">
      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        skeleton={<ListSkeleton rows={1} />}
        isEmpty={(data) => data.length === 0}
        empty={<EmptyState icon={UserPlus} title="No pending invitations" />}
      >
        {(invitations) => (
          <ul className="space-y-3">
            {invitations.map((invitation) => (
              <li key={`${invitation.kind}-${invitation.id}`} className="rounded-lg border p-3">
                <p className="font-medium">
                  {invitation.student?.first_name} {invitation.student?.last_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Invited as {invitation.kind === "parent" ? "parent/guardian" : invitation.kind}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({ kind: invitation.kind, relationshipId: invitation.id, accept: true })
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({ kind: invitation.kind, relationshipId: invitation.id, accept: false })
                    }
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </WidgetCard>
  );
}
