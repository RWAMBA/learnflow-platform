import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
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
import { assessmentKeys, listAssessments, listStudentAssessments } from "@/features/assessments/api";
import { AssessmentStatusBadge } from "@/features/assessments/components/status-badge";
import { ASSESSMENT_STATUSES, ASSESSMENT_STATUS_LABELS } from "@/features/assessments/constants";
import { canAuthorAssessments } from "@/features/roles/permissions";
import { startAttempt } from "@/lib/assessment-delivery.functions";
import { formatDateTime } from "@/lib/format";

const TITLE = "Assessments — the Platform";
const DESCRIPTION = "Create, schedule and track assessments across the curriculum.";

export const Route = createFileRoute("/_authenticated/assessments/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { activeRole } = useRoleContext();
  const currentStudent = useCurrentStudent();
  const navigate = useNavigate();
  const organizationId = activeRole?.organizationId ?? null;
  const isStudent = activeRole?.roleCode === "student";
  const studentId = currentStudent.data?.id ?? null;

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<string>("all");

  const authorQuery = useQuery({
    queryKey: assessmentKeys.list(organizationId ?? "none", { status }),
    enabled: Boolean(organizationId) && !isStudent,
    queryFn: () => listAssessments(organizationId!, { status: status as never }),
  });

  const studentQuery = useQuery({
    queryKey: assessmentKeys.studentAssessments(studentId ?? "none"),
    enabled: Boolean(organizationId) && isStudent && Boolean(studentId),
    queryFn: () =>
      listStudentAssessments({
        organizationId: organizationId!,
        studentId: studentId!,
        gradeId: currentStudent.data?.grade?.id ?? null,
      }),
  });

  const start = useServerFn(startAttempt);
  const startMutation = useMutation({
    mutationFn: (assessmentId: string) =>
      start({ data: { assessmentId, studentId: studentId! } }),
    onSuccess: (result) =>
      void navigate({
        to: "/assessments/take/$submissionId",
        params: { submissionId: result.submissionId },
      }),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not open this assessment"),
  });

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const list = isStudent
      ? (studentQuery.data ?? []).map((row) => row.assessment)
      : (authorQuery.data ?? []);
    return list.filter((row) => !needle || row.title.toLowerCase().includes(needle));
  }, [authorQuery.data, isStudent, studentQuery.data, term]);

  const query = isStudent ? studentQuery : authorQuery;

  return (
    <div>
      <PageHeader
        title="Assessments"
        description={DESCRIPTION}
        actions={
          canAuthorAssessments(activeRole?.roleCode) ? (
            <>
              <Button asChild variant="outline">
                <Link to="/assessments/bank">Question bank</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/assessments/analytics">Analytics</Link>
              </Button>
              <Button asChild>
                <Link to="/assessments/new">New assessment</Link>
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Search assessments"
          placeholder="Search by title"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="sm:max-w-xs"
        />
        {isStudent ? null : (
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-56" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ASSESSMENT_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {ASSESSMENT_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={rows}
        onRetry={() => void query.refetch()}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={ClipboardCheck}
            title="No assessments yet"
            description="Assessments you author or are assigned will appear here."
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
                        to="/assessments/$assessmentId"
                        params={{ assessmentId: row.id }}
                        className="font-medium hover:underline"
                      >
                        {row.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {row.type?.name ?? "Assessment"} · {row.subject?.name ?? "No subject"} ·{" "}
                        {row.grade?.name ?? "All grades"} · Due {formatDateTime(row.due_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <AssessmentStatusBadge status={row.status} />
                      {isStudent && studentId ? (
                        <Button
                          size="sm"
                          onClick={() => startMutation.mutate(row.id)}
                          disabled={startMutation.isPending}
                        >
                          Start or resume
                        </Button>
                      ) : null}
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