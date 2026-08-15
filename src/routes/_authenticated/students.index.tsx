import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRoleContext } from "@/features/roles/role-context";
import { can } from "@/features/roles/permissions";
import {
  listLinkedStudentsForParent,
  listRosterForEducator,
  listStudents,
  studentKeys,
} from "@/features/students/api";

export const Route = createFileRoute("/_authenticated/students/")({
  head: () => ({
    meta: [
      { title: "Students — the Platform" },
      {
        name: "description",
        content: "The students you manage or teach, with grade and pathway at a glance.",
      },
      { property: "og:title", content: "Students — the Platform" },
      { property: "og:description", content: "The students you manage or teach." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentsPage,
});

interface StudentRow {
  id: string;
  name: string;
  detail: string;
}

function StudentsPage() {
  const { viewer, activeRole } = useRoleContext();
  const roleCode = activeRole?.roleCode;
  const isEducator = roleCode === "teacher" || roleCode === "tutor";
  const organizationId = activeRole?.organizationId ?? "";

  const query = useQuery<StudentRow[]>({
    queryKey: isEducator
      ? ["roster", viewer.userId, roleCode]
      : roleCode === "org_admin"
        ? studentKeys.list(organizationId)
        : studentKeys.forViewer(viewer.userId),
    enabled: Boolean(activeRole),
    queryFn: async () => {
      if (isEducator) {
        const rows = await listRosterForEducator(
          viewer.userId,
          roleCode === "teacher" ? "teacher" : "tutor",
        );
        return rows.map((row) => ({
          id: row.student!.id,
          name: `${row.student?.first_name} ${row.student?.last_name}`,
          detail: row.subject?.name ?? "All subjects",
        }));
      }
      if (roleCode === "org_admin") {
        const rows = await listStudents(organizationId);
        return rows.map((row) => ({
          id: row.id,
          name: `${row.first_name} ${row.last_name}`,
          detail: row.grade?.name ?? "No grade set",
        }));
      }
      const rows = await listLinkedStudentsForParent(viewer.userId);
      return rows.map((row) => ({
        id: row.student!.id,
        name: `${row.student?.first_name} ${row.student?.last_name}`,
        detail: row.student?.grade?.name ?? "No grade set",
      }));
    },
  });

  return (
    <div>
      <PageHeader
        title={isEducator ? "Roster" : "Students"}
        description={
          isEducator
            ? "Students connected to you through an active teaching relationship."
            : "Students you manage, with their grade and pathway."
        }
        actions={
          can.manageStudents(roleCode) ? (
            <Button asChild>
              <Link to="/students/new">Add a student</Link>
            </Button>
          ) : null
        }
      />
      <QueryState
        isPending={query.isPending}
        error={query.error}
        data={query.data}
        onRetry={() => void query.refetch()}
        skeleton={<ListSkeleton />}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            icon={GraduationCap}
            title="No students yet"
            description={
              can.manageStudents(roleCode)
                ? "Add your first student to start assigning work."
                : "Students appear here once a guardian connects them to you."
            }
            action={
              can.manageStudents(roleCode) ? (
                <Button asChild size="sm">
                  <Link to="/students/new">Add a student</Link>
                </Button>
              ) : null
            }
          />
        }
      >
        {(rows) => (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <li key={row.id}>
                <Link to="/students/$studentId" params={{ studentId: row.id }}>
                  <Card className="h-full transition-colors duration-200 hover:bg-accent">
                    <CardContent className="pt-6">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-sm text-muted-foreground">{row.detail}</p>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
