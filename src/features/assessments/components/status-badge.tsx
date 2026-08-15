import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ASSESSMENT_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  type AssessmentStatus,
  type SubmissionStatus,
} from "../constants";

const TONE: Record<string, string> = {
  published: "border-success/50 text-success",
  open: "border-success/50 text-success",
  completed: "border-success/50 text-success",
  graded: "border-success/50 text-success",
  reviewed: "border-success/50 text-success",
  review: "border-warning/50 text-warning",
  scheduled: "border-warning/50 text-warning",
  grading: "border-warning/50 text-warning",
  submitted: "border-primary/50 text-primary",
  in_progress: "border-primary/50 text-primary",
  archived: "border-muted-foreground/40 text-muted-foreground",
  returned: "border-muted-foreground/40 text-muted-foreground",
};

export function AssessmentStatusBadge({ status }: { status: string | null | undefined }) {
  const value = (status ?? "draft") as AssessmentStatus;
  return (
    <Badge variant="outline" className={cn(TONE[value])}>
      {ASSESSMENT_STATUS_LABELS[value] ?? value}
    </Badge>
  );
}

export function SubmissionStatusBadge({ status }: { status: string | null | undefined }) {
  const value = (status ?? "in_progress") as SubmissionStatus;
  return (
    <Badge variant="outline" className={cn(TONE[value])}>
      {SUBMISSION_STATUS_LABELS[value] ?? value}
    </Badge>
  );
}
