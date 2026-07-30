import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/format";
import type { AssignmentStatus } from "../api";

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  graded: "Graded",
  overdue: "Overdue",
};

export function AssignmentStatusBadge({
  status,
  dueAt,
}: {
  status: AssignmentStatus | string;
  dueAt?: string | null;
}) {
  const overdue = status === "overdue" || isOverdue(dueAt, status);

  if (overdue) {
    return (
      <Badge variant="destructive" className="gap-1">
        <span aria-hidden="true">!</span> Overdue
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        status === "graded" && "border-success/50 text-success",
        status === "submitted" && "border-info/50 text-info",
      )}
    >
      {STATUS_LABELS[status as AssignmentStatus] ?? status}
    </Badge>
  );
}

const MASTERY_LABELS: Record<string, string> = {
  emerging: "Emerging",
  developing: "Developing",
  proficient: "Proficient",
  advanced: "Advanced",
};

/** Advanced mastery is a celebration state — the only place amber is used. */
export function MasteryBadge({ level }: { level: string }) {
  if (level === "advanced") {
    return <Badge className="bg-secondary text-secondary-foreground">Advanced</Badge>;
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        level === "proficient" && "border-success/50 text-success",
        level === "developing" && "border-info/50 text-info",
      )}
    >
      {MASTERY_LABELS[level] ?? level}
    </Badge>
  );
}
