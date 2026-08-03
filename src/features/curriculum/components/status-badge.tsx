import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  draft: "Draft",
  review: "In review",
  published: "Published",
  archived: "Archived",
};

export function CurriculumStatusBadge({ status }: { status: string | null | undefined }) {
  const value = status ?? "draft";
  return (
    <Badge
      variant="outline"
      className={cn(
        value === "published" && "border-success/50 text-success",
        value === "review" && "border-warning/50 text-warning",
        value === "archived" && "border-muted-foreground/40 text-muted-foreground",
      )}
    >
      {LABELS[value] ?? value}
    </Badge>
  );
}
