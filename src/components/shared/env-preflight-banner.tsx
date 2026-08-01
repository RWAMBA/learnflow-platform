import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSupabaseEnvPreflight } from "@/lib/env-preflight.functions";

const PROJECT_REF = import.meta.env['VITE_SUPABASE_PROJECT_ID'] as string | undefined;

const SETUP_URL = PROJECT_REF
  ? `https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api-keys`
  : "https://supabase.com/dashboard/projects";

/** Preset auto-recheck intervals. */
const INTERVAL_OPTIONS = [
  { label: "30 seconds", value: 30_000 },
  { label: "1 minute", value: 60_000 },
  { label: "2 minutes", value: 120_000 },
  { label: "5 minutes", value: 300_000 },
];

/** Exact click-path for configuring each variable in Lovable Cloud. */
const SETUP_STEPS: Record<string, string[]> = {
  SUPABASE_URL: [
    "In Lovable, open the Cloud view (desktop: nav icon or More → Cloud; mobile: chat mode → ... → Cloud).",
    "Go to Cloud → Secrets.",
    "Add a secret named SUPABASE_URL.",
    "Paste your project URL from Supabase → Settings → API keys (format: https://<project-ref>.supabase.co).",
    "Save, then reload this page.",
  ],
  SUPABASE_PUBLISHABLE_KEY: [
    "Open Cloud → Secrets in Lovable.",
    "Add a secret named SUPABASE_PUBLISHABLE_KEY.",
    "Copy the publishable (anon) key from Supabase → Settings → API keys — never the service role key here.",
    "Save, then reload this page.",
  ],
  SUPABASE_SERVICE_ROLE_KEY: [
    "Open Cloud → Secrets in Lovable.",
    "Add a secret named SUPABASE_SERVICE_ROLE_KEY.",
    "Copy the service_role secret key from Supabase → Settings → API keys, revealing it first.",
    "Save it — this key bypasses row-level security, so it stays server-side only.",
    "Reload this page; if it still reports missing, ask Lovable to refresh the Supabase key binding.",
  ],
};

const FALLBACK_STEPS = [
  "Open Cloud → Secrets in Lovable.",
  "Add a secret with this exact name.",
  "Paste the matching value from your Supabase project settings, save, and reload this page.",
];

/**
 * Surfaces missing server-side configuration up front, so a blank screen from
 * a failed server action is explained before the user triggers it.
 */
export function EnvPreflightBanner() {
  const preflight = useServerFn(getSupabaseEnvPreflight);
  const [autoRecheck, setAutoRecheck] = useState(true);
  const [intervalMs, setIntervalMs] = useState(120_000);
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["supabase-env-preflight"],
    queryFn: () => preflight(),
    staleTime: 60_000,
    retry: false,
    // Poll only while something is still missing; stop once the env is healthy.
    refetchInterval: (query) =>
      autoRecheck && query.state.data && !query.state.data.ok
        ? intervalMs
        : false,
    refetchIntervalInBackground: false,
  });

  if (!data || data.ok) return null;

  const activeLabel = INTERVAL_OPTIONS.find((o) => o.value === intervalMs)?.label ?? "custom";

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
          <ul className="mt-3 space-y-4">
            {data.missing.map((entry) => (
              <li key={entry.name} className="rounded-md border bg-card p-3">
                <p>
                  <code className="font-mono text-xs">{entry.name}</code>
                  <span className="text-muted-foreground"> — {entry.purpose}</span>
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                  {(SETUP_STEPS[entry.name] ?? FALLBACK_STEPS).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={SETUP_URL} target="_blank" rel="noreferrer noopener">
                Open Supabase API keys
                <ExternalLink aria-hidden="true" className="ml-2 size-4" />
              </a>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw
                aria-hidden="true"
                className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`}
              />
              {isFetching ? "Re-checking…" : "Re-run check"}
            </Button>
            <div className="flex items-center gap-2">
              <Switch
                id="env-preflight-auto-recheck"
                checked={autoRecheck}
                onCheckedChange={setAutoRecheck}
              />
              <Label htmlFor="env-preflight-auto-recheck" className="text-xs font-normal">
                Auto re-check
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="env-preflight-interval" className="text-xs font-normal">
                Every
              </Label>
              <select
                id="env-preflight-interval"
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                disabled={!autoRecheck}
                className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                aria-label="Auto re-check interval"
              >
                {INTERVAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {autoRecheck && (
            <p className="mt-2 text-xs text-muted-foreground">
              Re-checking automatically every {activeLabel} until all variables are configured.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
