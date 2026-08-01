import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { curriculumKeys, getStudentProgressOverview } from "@/features/curriculum/api";
import { MASTERY_LABELS } from "@/features/curriculum/components/curriculum-dialogs";
import { useCurrentStudent } from "@/features/dashboard/use-viewer-students";
import { listStudents, studentKeys } from "@/features/students/api";
import { useRoleContext } from "@/features/roles/role-context";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/curriculum/progress")({
  head: () => ({
    meta: [
      { title: "Learning progress — the Platform" },
      {
        name: "description",
        content: "Track subject completion and recorded mastery levels for each learner.",
      },
      { property: "og:title", content: "Learning progress — the Platform" },
      {
        property: "og:description",
        content: "Subject completion and mastery levels captured for each learner.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProgressPage,
});

function ProgressPage() {
  const { activeRole } = useRoleContext();
  const isStudent = activeRole?.roleCode === "student";
  const organizationId = activeRole?.organizationId ?? "";
  const currentStudent = useCurrentStudent();
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const students = useQuery({
    queryKey: studentKeys.list(organizationId),
    enabled: !isStudent && Boolean(organizationId),
    queryFn: () => listStudents(organizationId),
  });

  const studentId = isStudent ? (currentStudent.data?.id ?? "") : selectedStudentId;

  const overview = useQuery({
    queryKey: curriculumKeys.progress(studentId),
    enabled: Boolean(studentId),
    queryFn: () => getStudentProgressOverview(studentId),
  });

  return (
    <div>
      <PageHeader
        title="Learning progress"
        description="Subject completion and the mastery levels captured against lessons and objectives."
      />

      {!isStudent ? (
        <Card className="mb-6">
          <CardContent className="p-4">
            <Label htmlFor="progress-student">Student</Label>
            <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
              <SelectTrigger id="progress-student" className="sm:max-w-sm">
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent>
                {(students.data ?? []).map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.first_name} {student.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ) : null}

      {!studentId ? (
        <EmptyState
          title={isStudent ? "No learner record yet" : "Choose a student"}
          description={
            isStudent
              ? "Your guardian or school needs to link your learner record."
              : "Select a student to see their curriculum progress."
          }
        />
      ) : (
        <QueryState
          isPending={overview.isPending}
          error={overview.error}
          data={overview.data}
          onRetry={() => void overview.refetch()}
          skeleton={<ListSkeleton rows={4} />}
        >
          {(data) => (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Subject completion</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.subjects.length === 0 ? (
                    <EmptyState
                      title="No subjects assigned"
                      description="Assign subjects to this learner to start tracking progress."
                    />
                  ) : (
                    <ul className="space-y-4">
                      {data.subjects.map((subject) => (
                        <li key={subject.subjectId} className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Link
                              to="/curriculum/subjects/$subjectId"
                              params={{ subjectId: subject.subjectId }}
                              className="font-medium hover:underline"
                            >
                              {subject.subjectName}
                            </Link>
                            <span className="text-sm text-muted-foreground">
                              {subject.gradeName ?? "—"} · {subject.completedLessons}/
                              {subject.totalLessons} lessons · {subject.percent}%
                            </span>
                          </div>
                          <Progress
                            value={subject.percent}
                            aria-label={`${subject.subjectName} progress`}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent progress records</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.records.length === 0 ? (
                    <EmptyState
                      title="Nothing recorded yet"
                      description="Educators and guardians can record mastery from any lesson page."
                    />
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {data.records.slice(0, 25).map((record) => (
                        <li
                          key={record.id}
                          className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="font-medium">
                              {record.lesson?.title ??
                                record.objective?.description ??
                                record.competency?.name ??
                                "Progress record"}
                            </p>
                            {record.notes ? (
                              <p className="text-sm text-muted-foreground">{record.notes}</p>
                            ) : null}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {MASTERY_LABELS[record.mastery_level] ?? record.mastery_level} ·{" "}
                            {formatDateTime(record.recorded_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </QueryState>
      )}
    </div>
  );
}
