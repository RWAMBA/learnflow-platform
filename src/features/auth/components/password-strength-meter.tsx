import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluatePassword } from "../password-rules";

export function PasswordStrengthMeter({ value }: { value: string }) {
  const { score, label, results, passed, total } = evaluatePassword(value);
  const tone =
    passed === total
      ? "bg-primary"
      : passed >= total - 2
        ? "bg-accent-foreground"
        : "bg-destructive";

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Password strength</span>
        <span className="font-medium text-foreground">{label}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-300", tone)}
          style={{ width: `${value.length === 0 ? 0 : Math.max(score, 8)}%` }}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Password strength"
        />
      </div>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {results.map((rule) => (
          <li
            key={rule.id}
            className={cn(
              "flex items-center gap-1.5",
              rule.met ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {rule.met ? (
              <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
            ) : (
              <X className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
