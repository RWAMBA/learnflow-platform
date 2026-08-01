import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSupabaseEnvPreflight } from "@/lib/env-preflight.functions";

const PROJECT_REF = import.meta.env["VITE_SUPABASE_PROJECT_ID"] as string | undefined;

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

const DEFAULT_AUTO_RECHECK = true;
const DEFAULT_INTERVAL_MS = 120_000;
const HISTORY_LIMIT = 5;

/** Settings are namespaced per Supabase project ref so environments stay isolated. */
const LS_NAMESPACE = `platform-env-preflight:${PROJECT_REF ?? "unknown-project"}`;
const LS_KEY_AUTO_RECHECK = `${LS_NAMESPACE}:auto-recheck`;
const LS_KEY_INTERVAL_SECONDS = `${LS_NAMESPACE}:interval-seconds`;

interface CheckRecord {
  at: number;
  ok: boolean;
  missing: string[];
}

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

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1_000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

function formatClock(at: number) {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Surfaces missing server-side configuration up front, so a blank screen from
 * a failed server action is explained before the user triggers it.
 */
export function EnvPreflightBanner() {
  const preflight = useServerFn(getSupabaseEnvPreflight);
  const [autoRecheck, setAutoRecheck] = useState(DEFAULT_AUTO_RECHECK);
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL_MS);
  const [customSeconds, setCustomSeconds] = useState<string>("60");
  const [hydrated, setHydrated] = useState(false);
  const [history, setHistory] = useState<CheckRecord[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const isCustom = useMemo(
    () => !INTERVAL_OPTIONS.some((o) => o.value === intervalMs),
    [intervalMs],
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

  const { data, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["supabase-env-preflight"],
    queryFn: () => preflight(),
    staleTime: 60_000,
    retry: false,
    // Poll only while something is still missing; stop once the env is healthy.
    refetchInterval: (query) =>
      autoRecheck && query.state.data && !query.state.data.ok ? intervalMs : false,
    refetchIntervalInBackground: false,
  });

  // Record each completed check so the user can see what was missing over time.
  const lastRecordedRef = useRef<number | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!data || !dataUpdatedAt) return;
    if (lastRecordedRef.current === dataUpdatedAt) return;
    lastRecordedRef.current = dataUpdatedAt;
    setHistory((prev) =>
      [{ at: dataUpdatedAt, ok: data.ok, missing: data.missing.map((m) => m.name) }, ...prev].slice(
        0,
        HISTORY_LIMIT,
      ),
    );
    setLastCheckedAt(dataUpdatedAt);
  }, [data, dataUpdatedAt]);

  // Tick once per second while a countdown is visible.
  const countdownActive = autoRecheck && !!data && !data.ok;
  useEffect(() => {
    if (!countdownActive) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [countdownActive]);

  const resetSettings = useCallback(() => {
    setAutoRecheck(DEFAULT_AUTO_RECHECK);
    setIntervalMs(DEFAULT_INTERVAL_MS);
    setCustomSeconds("60");
    try {
      window.localStorage.removeItem(LS_KEY_AUTO_RECHECK);
      window.localStorage.removeItem(LS_KEY_INTERVAL_SECONDS);
    } catch {
      // ignore
    }
  }, []);

  if (!data || data.ok) return null;

  const nextRunAt = lastCheckedAt != null ? lastCheckedAt + intervalMs : null;
  const countdownMs = nextRunAt != null ? nextRunAt - now : null;

  const activeLabel =
    INTERVAL_OPTIONS.find((o) => o.value === intervalMs)?.label ?? formatInterval(intervalMs);
  const customParsed = Number(customSeconds);
  const customValid =
    Number.isFinite(customParsed) && customParsed >= MIN_SECONDS && customParsed <= MAX_SECONDS;

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
            <Button type="button" variant="ghost" size="sm" onClick={resetSettings}>
              <RotateCcw aria-hidden="true" className="mr-2 size-4" />
              Reset settings
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
                    setIntervalMs(
                      Number.isFinite(parsed) && parsed >= MIN_SECONDS ? parsed * 1_000 : 60_000,
                    );
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
                      if (
                        Number.isFinite(parsed) &&
                        parsed >= MIN_SECONDS &&
                        parsed <= MAX_SECONDS
                      ) {
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
              {countdownMs != null && (
                <span className="ml-1" aria-live="polite">
                  {isFetching ? "Checking now…" : `Next check in ${formatCountdown(countdownMs)}.`}
                </span>
              )}
              {isCustom && !customValid && (
                <span className="ml-1 text-destructive">
                  Enter a value between {MIN_SECONDS} and {MAX_SECONDS} seconds.
                </span>
              )}
            </p>
          )}
          {history.length > 0 && (
            <div className="mt-3 rounded-md border bg-card p-3">
              <p className="text-xs font-medium">Recent checks</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {history.map((entry) => (
                  <li key={entry.at} className="flex flex-wrap gap-x-2">
                    <span className="font-mono">{formatClock(entry.at)}</span>
                    <span>
                      {entry.ok ? "All variables present" : `Missing: ${entry.missing.join(", ")}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
