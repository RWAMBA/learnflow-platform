import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "./error-state";

interface QueryStateProps<T> {
  isPending: boolean;
  error: unknown;
  data: T | undefined;
  onRetry?: () => void;
  skeleton?: ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}

/**
 * Renders the four async states (loading / error / empty / success) for every
 * list, table and dashboard widget in the app.
 */
export function QueryState<T>({
  isPending,
  error,
  data,
  onRetry,
  skeleton,
  isEmpty,
  empty,
  children,
}: QueryStateProps<T>) {
  if (isPending) {
    return (
      <div aria-busy="true" aria-live="polite">
        {skeleton ?? <ListSkeleton />}
      </div>
    );
  }
  if (error) return <ErrorState onRetry={onRetry} />;
  if (!data) return <ErrorState onRetry={onRetry} />;
  if (isEmpty?.(data) && empty) return <>{empty}</>;
  return <>{children(data)}</>;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return <Skeleton className="h-48 w-full rounded-xl" />;
}
