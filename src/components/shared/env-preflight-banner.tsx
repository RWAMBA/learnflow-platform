import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const CUSTOM_VALUE = "custom";
const MIN_SECONDS = 5;
const MAX_SECONDS = 3600;

const LS_KEY_AUTO_RECHECK = "platform-env-preflight-auto-recheck";
const LS_KEY_INTERVAL_SECONDS = "platform-env-preflight-interval-seconds";

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

function formatInterval(ms: number) {
  if (ms < 60_000) return `${ms / 1_000} seconds`;
  if (ms % 60_000 === 0) return `${ms / 60_000} minute${ms === 60_000 ? "" : "s"}`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = (ms % 60_000) / 1_000;
  return `${minutes}m ${seconds}s`;
}

function clampSeconds(value: number) {
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.floor(value)));
}

/**
 * Surfaces missing server-side configuration up front, so a blank screen from
 * a failed server action is explained before the user triggers it.
 */
export function EnvPreflightBanner() {
  const preflight = useServerFn(getSupabaseEnvPreflight);
  const [autoRecheck, setAutoRecheck] = useState(true);
  const [intervalMs, setIntervalMs] = useState(120_000);
  const [customSeconds, setCustomSeconds] = useState<string>("60");
  const [hydrated, setHydrated] = useState(false);
  const isCustom = useMemo(
    () => !INTERVAL_OPTIONS.some((o) => o.value === intervalMs),
    [intervalMs]
  );

  // Hydrate persisted preferences on the client only.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedAuto = window.localStorage.getItem(LS_KEY_AUTO_RECHECK);
      const savedSeconds = window.localStorage.getItem(LS_KEY_INTERVAL_SECONDS);
      if (savedAuto != null) {
        setAutoRecheck(savedAuto === "true");
      }
      if (savedSeconds != null) {
        const parsed = Number(savedSeconds);
        if (Number.isFinite(parsed)) {
          const clamped = clampSeconds(parsed);
          setIntervalMs(clamped * 1_000);
          setCustomSeconds(String(clamped));
        }
      }
    } catch {
      // localStorage may be unavailable in some contexts; ignore silently.
    }
    setHydrated(true);
  }, []);

  // Persist toggle changes.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LS_KEY_AUTO_RECHECK, String(autoRecheck));
    } catch {
      // ignore
    }
  }, [autoRecheck, hydrated]);

  // Persist interval changes.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LS_KEY_INTERVAL_SECONDS, String(Math.floor(intervalMs / 1_000)));
    } catch {
      // ignore
    }
  }, [intervalMs, hydrated]);

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

  const activeLabel = INTERVAL_OPTIONS.find((o) => o.value === intervalMs)?.label ?? formatInterval(intervalMs);
  const customParsed = Number(customSeconds);
  const customValid = Number.isFinite(customParsed) && customParsed >= MIN_SECONDS && customParsed <= MAX_SECONDS;

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
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="env-preflight-interval" className="text-xs font-normal">
                Every
              </Label>
              <select
                id="env-preflight-interval"
                value={isCustom ? CUSTOM_VALUE : intervalMs}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === CUSTOM_VALUE) {
                    const parsed = Number(customSeconds);
                    setIntervalMs(Number.isFinite(parsed) && parsed >= MIN_SECONDS ? parsed * 1_000 : 60_000);
                  } else {
                    setIntervalMs(Number(value));
                  }
                }}
                disabled={!autoRecheck}
                className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                aria-label="Auto re-check interval"
              >
                {INTERVAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value={CUSTOM_VALUE}>Custom…</option>
              </select>
              {isCustom && (
                <div className="flex items-center gap-2">
                  <Input
                    id="env-preflight-custom-seconds"
                    type="number"
                    min={MIN_SECONDS}
                    max={MAX_SECONDS}
                    value={customSeconds}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCustomSeconds(raw);
                      const parsed = Number(raw);
                      if (Number.isFinite(parsed) && parsed >= MIN_SECONDS && parsed <= MAX_SECONDS) {
                        setIntervalMs(parsed * 1_000);
                      }
                    }}
                    disabled={!autoRecheck}
                    className="h-8 w-24 text-xs"
                    aria-label="Custom interval in seconds"
                  />
                  <Label htmlFor="env-preflight-custom-seconds" className="text-xs font-normal">
                    seconds
                  </Label>
                </div>
              )}
            </div>
          </div>
          {autoRecheck && (
            <p className="mt-2 text-xs text-muted-foreground">
              Re-checking automatically every {activeLabel} until all variables are configured.
              {isCustom && !customValid && (
                <span className="ml-1 text-destructive">
                  Enter a value between {MIN_SECONDS} and {MAX_SECONDS} seconds.
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
