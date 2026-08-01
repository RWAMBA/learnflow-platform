import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, GraduationCap, Layers, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurriculumStatusBadge } from "@/features/curriculum/components/status-badge";
import {
  curriculumKeys,
  getCurriculumStats,
  listGrades,
  listStudentCurriculumAssignments,
  searchLessons,
  type CurriculumSearchParams,
  type PublishStatus,
} from "@/features/curriculum/api";
import { useCurrentStudent } from "@/features/dashboard/use-viewer-students";
import { useRoleContext } from "@/features/roles/role-context";

const PAGE_SIZE = 10;

export const Route = createFileRoute("/_authenticated/curriculum/")({
  head: () => ({
    meta: [
      { title: "Curriculum — the Platform" },
      {
        name: "description",
        content:
          "Browse grades, pathways, subjects, topics and lessons, and search the whole curriculum.",
      },
      { property: "og:title", content: "Curriculum — the Platform" },
      {
        property: "og:description",
        content: "Browse and search grades, subjects, topics and lessons.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CurriculumDashboard,
});

function CurriculumDashboard() {
  const { activeRole } = useRoleContext();
  const organizationId = activeRole?.organizationId ?? null;
  const isStudent = activeRole?.roleCode === "student";
  const currentStudent = useCurrentStudent();

  const [term, setTerm] = useState("");
  const [gradeId, setGradeId] = useState<string>("all");
  const [status, setStatus] = useState<PublishStatus | "all">("all");
  const [contentType, setContentType] = useState<string>("all");
  const [page, setPage] = useState(1);

  const grades = useQuery({
    queryKey: curriculumKeys.grades(null),
    queryFn: () => listGrades(null),
  });

  const stats = useQuery({
    queryKey: curriculumKeys.stats(organizationId ?? "none"),
    queryFn: () => getCurriculumStats(organizationId),
  });

  const searchParams: CurriculumSearchParams = useMemo(
    () => ({
      term,
      gradeId: gradeId === "all" ? null : gradeId,
      status,
      contentType,
      page,
      pageSize: PAGE_SIZE,
    }),
    [term, gradeId, status, contentType, page],
  );

  const results = useQuery({
    queryKey: curriculumKeys.search(searchParams),
    queryFn: () => searchLessons(searchParams),
    placeholderData: keepPreviousData,
  });

  const studentId = currentStudent.data?.id ?? "";
  const myCurriculum = useQuery({
    queryKey: curriculumKeys.studentAssignments(studentId),
    enabled: isStudent && Boolean(studentId),
    queryFn: () => listStudentCurriculumAssignments(studentId),
  });

  const totalPages = Math.max(1, Math.ceil((results.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Curriculum"
        description="Grades, pathways, subjects, topics and lessons — searchable across the whole library."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Grades" value={stats.data?.grades} icon={GraduationCap} />
        <StatCard label="Subjects" value={stats.data?.subjects} icon={Layers} />
        <StatCard label="Topics" value={stats.data?.topics} icon={BookOpen} />
        <StatCard label="Lessons" value={stats.data?.lessons} icon={BookOpen} />
      </div>

      {isStudent ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">My curriculum</CardTitle>
          </CardHeader>
          <CardContent>
            <QueryState
              isPending={myCurriculum.isPending && Boolean(studentId)}
              error={myCurriculum.error}
              data={myCurriculum.data ?? []}
              onRetry={() => void myCurriculum.refetch()}
              skeleton={<ListSkeleton rows={2} />}
              isEmpty={(rows) => rows.length === 0}
              empty={
                <EmptyState
                  title="No subjects assigned yet"
                  description="Your teacher or guardian will assign subjects to you."
                />
              }
            >
              {(rows) => (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <Link
                        to="/curriculum/subjects/$subjectId"
                        params={{ subjectId: row.subject!.id }}
                        className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-accent"
                      >
                        <span className="font-medium">{row.subject?.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {row.subject?.grade?.name ?? "—"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Grades</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryState
            isPending={grades.isPending}
            error={grades.error}
            data={grades.data}
            onRetry={() => void grades.refetch()}
            skeleton={<ListSkeleton rows={3} />}
            isEmpty={(rows) => rows.length === 0}
            empty={
              <EmptyState title="No grades yet" description="No curriculum grades are available." />
            }
          >
            {(rows) => (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((grade) => (
                  <li key={grade.id}>
                    <Link
                      to="/curriculum/grades/$gradeId"
                      params={{ gradeId: grade.id }}
                      className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-accent"
                    >
                      <span className="font-medium">{grade.name}</span>
                      {grade.pathway_required ? (
                        <span className="text-xs text-muted-foreground">Pathways</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search lessons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="curriculum-search">Search</Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="curriculum-search"
                  className="pl-9"
                  placeholder="Lesson title…"
                  value={term}
                  onChange={(event) => {
                    setTerm(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <FilterSelect
              id="filter-grade"
              label="Grade"
              value={gradeId}
              onChange={(value) => {
                setGradeId(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All grades" },
                ...(grades.data ?? []).map((grade) => ({ value: grade.id, label: grade.name })),
              ]}
            />
            <FilterSelect
              id="filter-status"
              label="Status"
              value={status}
              onChange={(value) => {
                setStatus(value as PublishStatus | "all");
                setPage(1);
              }}
              options={[
                { value: "all", label: "Any status" },
                { value: "published", label: "Published" },
                { value: "draft", label: "Draft" },
                { value: "archived", label: "Archived" },
              ]}
            />
            <FilterSelect
              id="filter-type"
              label="Content type"
              value={contentType}
              onChange={(value) => {
                setContentType(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: "Any type" },
                ...["text", "video", "document", "link", "quiz"].map((type) => ({
                  value: type,
                  label: type,
                })),
              ]}
            />
          </div>

          <QueryState
            isPending={results.isPending}
            error={results.error}
            data={results.data}
            onRetry={() => void results.refetch()}
            skeleton={<ListSkeleton rows={4} />}
            isEmpty={(value) => value.rows.length === 0}
            empty={
              <EmptyState
                title="No lessons match"
                description="Try a different search term or clear the filters."
              />
            }
          >
            {(value) => (
              <div className="space-y-3">
                <ul className="divide-y rounded-md border">
                  {value.rows.map((lesson) => (
                    <li key={lesson.id}>
                      <Link
                        to="/curriculum/lessons/$lessonId"
                        params={{ lessonId: lesson.id }}
                        className="flex flex-col gap-1 p-3 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="font-medium">{lesson.title}</span>
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          {lesson.subject?.grade?.name ?? "—"} · {lesson.subject?.name}
                          <CurriculumStatusBadge status={lesson.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    Page {page} of {totalPages} · {value.total} lesson{value.total === 1 ? "" : "s"}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || results.isFetching}
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages || results.isFetching}
                      onClick={() => setPage((prev) => prev + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | undefined;
  icon: typeof BookOpen;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value ?? "—"}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
