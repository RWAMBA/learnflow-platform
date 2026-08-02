import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoleContext } from "@/features/roles/role-context";
import { useCurrentStudent } from "@/features/dashboard/use-viewer-students";
import {
  assignmentKeys,
  listAssignmentsForOrganization,
  listAssignmentsForStudents,
} from "@/features/assignments/api";
import { AssignmentStatusBadge } from "@/features/assignments/components/status-badge";
import { can } from "@/features/roles/permissions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/assignments/")({
  head: () => ({
    meta: [
      { title: "Assignments — the Platform" },
      { name: "description", content: "Track assigned work, submissions and grading." },
      { property: "og:title", content: "Assignments — the Platform" },
      { property: "og:description", content: "Track assigned work, submissions and grading." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const STATUSES = ["all", "not_started", "in_progress", "submitted", "graded"] as const;

function Page() {
  const { activeRole } = useRoleContext();
  const currentStudent = useCurrentStudent();
  const isStudent = activeRole?.roleCode === "student";
  const organizationId = activeRole?.organizationId ?? null;
  const studentId = currentStudent.data?.id ?? null;

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");

  const query = useQuery({
    queryKey: assignmentKeys.list(isStudent ? `student:${studentId}` : `org:${organizationId}`),
    enabled: isStudent ? Boolean(studentId) : Boolean(organizationId),
    queryFn: () =>
      isStudent
        ? listAssignmentsForStudents([studentId!])
        : listAssignmentsForOrganization(organizationId!),
  });

  const rows = useMemo(() => {
    const list = query.data ?? [];
    return list.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!term.trim()) return true;
      const needle = term.trim().toLowerCase();
      return (
        (row.lesson?.title ?? "").toLowerCase().includes(needle) ||
        `${row.student?.first_name ?? ""} ${row.student?.last_name ?? ""}`
          .toLowerCase()
          .includes(needle)
      );
    });
  }, [query.data, status, term]);

  return (
    <div>
      <PageHeader
        title="Assignments"
        description="Track assigned work, submissions and grading."
        actions={
          can.createAssignments(activeRole?.roleCode) ? (
            <Button asChild>
              <Link to="/assignments/new">Assign work</Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Search assignments"
          placeholder="Search by lesson or student"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger className="sm:w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "all" ? "All statuses" : value.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={rows}
        onRetry={() => void query.refetch()}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            description="Work you assign or receive will appear here."
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
                      <Link
                        to="/assignments/$assignmentId"
                        params={{ assignmentId: row.id }}
                        className="font-medium hover:underline"
                      >
                        {row.lesson?.title ?? "Lesson"}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {row.student?.first_name} {row.student?.last_name} ·{" "}
                        {row.lesson?.subject?.name ?? "—"} · Due {formatDateTime(row.due_at)}
                      </p>
                    </div>
                    <AssignmentStatusBadge status={row.status} dueAt={row.due_at} />
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
