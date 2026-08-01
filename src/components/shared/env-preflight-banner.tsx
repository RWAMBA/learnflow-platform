import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabaseEnvPreflight } from "@/lib/env-preflight.functions";

const PROJECT_REF = import.meta.env['VITE_SUPABASE_PROJECT_ID'] as string | undefined;

const SETUP_URL = PROJECT_REF
  ? `https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api-keys`
  : "https://supabase.com/dashboard/projects";

/**
 * Surfaces missing server-side configuration up front, so a blank screen from
 * a failed server action is explained before the user triggers it.
 */
export function EnvPreflightBanner() {
  const preflight = useServerFn(getSupabaseEnvPreflight);
  const { data } = useQuery({
    queryKey: ["supabase-env-preflight"],
    queryFn: () => preflight(),
    staleTime: 60_000,
    retry: false,
  });

  if (!data || data.ok) return null;

  return (
    <div
      role="alert"
      className="mx-auto mb-4 w-full max-w-7xl rounded-lg border border-destructive/40 bg-destructive/5 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="text-sm">
          <p className="font-medium">Server configuration incomplete</p>
          <p className="mt-1 text-muted-foreground">
            Server actions will fail until these variables are configured:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {data.missing.map((entry) => (
              <li key={entry.name}>
                <code className="font-mono text-xs">{entry.name}</code>
                <span className="text-muted-foreground"> — {entry.purpose}</span>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <a href={SETUP_URL} target="_blank" rel="noreferrer noopener">
              Open Supabase API keys
              <ExternalLink aria-hidden="true" className="ml-2 size-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
