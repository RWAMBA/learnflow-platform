import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PublishStatus } from "../api";

const LABELS: Record<PublishStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export function CurriculumStatusBadge({ status }: { status: string | null | undefined }) {
  const value = (status ?? "draft") as PublishStatus;
  return (
    <Badge
      variant="outline"
      className={cn(
        value === "published" && "border-success/50 text-success",
        value === "archived" && "border-muted-foreground/40 text-muted-foreground",
      )}
    >
      {LABELS[value] ?? value}
    </Badge>
  );
}
