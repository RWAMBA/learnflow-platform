import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listProgrammes, programmeKeys } from "@/features/programmes/api";
import { ProgrammeDialog } from "@/features/programmes/components/programme-dialogs";
import {
  PROGRAMME_CATEGORIES,
  PROGRAMME_CATEGORY_LABELS,
  PROGRAMME_STATUSES,
  PROGRAMME_STATUS_LABELS,
  programmeIsFull,
  programmePlacesRemaining,
} from "@/features/programmes/constants";
import { canManageProgrammes } from "@/features/roles/permissions";
import { useRoleContext } from "@/features/roles/role-context";

const TITLE = "Programmes — LearnFlow";
const DESCRIPTION =
  "Browse and manage extracurricular programmes offered alongside the academic curriculum.";

export const Route = createFileRoute("/_authenticated/programmes/")({
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
  component: ProgrammesPage,
});

const ALL = "__all__";

function ProgrammesPage() {
  const { activeRole } = useRoleContext();
  const organizationId = activeRole?.organizationId ?? null;
  const mayManage = canManageProgrammes(activeRole?.roleCode);
  const queryClient = useQueryClient();

  const [category, setCategory] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);

  const programmes = useQuery({
    queryKey: programmeKeys.list(organizationId),
    queryFn: () => listProgrammes(organizationId),
    enabled: Boolean(organizationId),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: programmeKeys.all });

  const filtered = useMemo(() => {
    return (programmes.data ?? []).filter(
      (programme) =>
        (category === ALL || programme.category === category) &&
        (status === ALL || programme.status === status),
    );
  }, [programmes.data, category, status]);

  return (
    <div>
      <PageHeader
        title="Programmes"
        description="Extracurricular programmes run alongside the academic curriculum. Completion is recorded as a status — no certificate is issued."
        actions={
          mayManage && organizationId ? (
            <ProgrammeDialog
              organizationId={organizationId}
              onSaved={refresh}
              trigger={
                <Button>
                  <Plus aria-hidden="true" className="size-4" /> New programme
                </Button>
              }
            />
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="filter-category">
            Category
          </label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="filter-category" className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {PROGRAMME_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {PROGRAMME_CATEGORY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="filter-status">
            Status
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="filter-status" className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {PROGRAMME_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {PROGRAMME_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <QueryState
        isPending={programmes.isPending}
        error={programmes.error}
        data={filtered}
        onRetry={() => void programmes.refetch()}
        skeleton={<ListSkeleton rows={3} />}
        isEmpty={(list) => list.length === 0}
        empty={
          <EmptyState
            icon={Sparkles}
            title="No programmes to show"
            description={
              mayManage
                ? "Create a programme, then publish it so learners can be enrolled."
                : "Your organization has not published any programmes yet."
            }
          />
        }
      >
        {(list) => (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((programme) => {
              const remaining = programmePlacesRemaining(programme.capacity, programme.occupied);
              const full = programmeIsFull(programme.capacity, programme.occupied);
              return (
                <li key={programme.id}>
                  <Card className="h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">
                          <Link
                            to="/programmes/$programmeId"
                            params={{ programmeId: programme.id }}
                            className="hover:underline"
                          >
                            {programme.name}
                          </Link>
                        </CardTitle>
                        <Badge variant={programme.status === "published" ? "default" : "secondary"}>
                          {PROGRAMME_STATUS_LABELS[programme.status]}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {PROGRAMME_CATEGORY_LABELS[programme.category]}
                        </Badge>
                        {full ? <Badge variant="destructive">Full</Badge> : null}
                      </div>
                      {programme.scheduleDescription ? (
                        <p className="text-muted-foreground">{programme.scheduleDescription}</p>
                      ) : null}
                      <p className="text-muted-foreground">
                        {programme.capacity === null
                          ? `${programme.occupied} enrolled · unlimited places`
                          : `${programme.occupied} of ${programme.capacity} places taken · ${remaining} remaining`}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
