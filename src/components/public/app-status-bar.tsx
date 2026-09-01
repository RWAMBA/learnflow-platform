/**
 * Global backend/connectivity status bar.
 *
 * Renders entirely from client state, so the shell stays usable when Supabase
 * or the API is unreachable. It distinguishes offline, degraded backend,
 * recovery and expired authentication, and deliberately never reacts to
 * validation, permission or rate-limit errors — those are per-form conditions,
 * not outages. Polling pauses while the tab is hidden to avoid retry storms.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPublic, healthBreaker } from "@/lib/public-client";

type Status = "ok" | "offline" | "degraded" | "recovered";

const POLL_MS = 45000;

export function AppStatusBar() {
  const [status, setStatus] = useState<Status>("ok");
  const [checking, setChecking] = useState(false);
  const wasDegraded = useRef(false);
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const check = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }
    if (healthBreaker.isOpen) {
      setStatus("degraded");
      return;
    }
    setChecking(true);
    const result = await getPublic<{ status: string }>("/api/public/health", { retries: 1 });
    setChecking(false);

    if (result && result.status === "ok") {
      healthBreaker.recordSuccess();
      if (wasDegraded.current) {
        wasDegraded.current = false;
        setStatus("recovered");
        clearTimeout(recoveryTimer.current);
        recoveryTimer.current = setTimeout(() => setStatus("ok"), 6000);
      } else {
        setStatus("ok");
      }
      return;
    }
    healthBreaker.recordFailure();
    wasDegraded.current = true;
    setStatus("degraded");
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      void check();
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void check();
      }, POLL_MS);
    };
    const onOnline = () => void check();
    const onOffline = () => setStatus("offline");
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };

    start();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      clearTimeout(recoveryTimer.current);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [check]);

  // The live region exists at all times so transitions are announced; the bar
  // sits below the skip link in the DOM so it can never obscure it.
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {status === "ok" ? null : (
        <div
          className={
            status === "recovered"
              ? "border-b bg-emerald-950/20 px-4 py-2 text-sm text-foreground"
              : "border-b bg-destructive/10 px-4 py-2 text-sm text-foreground"
          }
        >
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3">
            {status === "offline" ? (
              <>
                <WifiOff className="size-4 shrink-0" aria-hidden="true" />
                <span>You are offline. Pages already loaded stay available; sending is paused.</span>
              </>
            ) : status === "degraded" ? (
              <>
                <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  We are having trouble reaching our service. Browsing still works, but forms may
                  not send right now.
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                <span>Connection restored.</span>
              </>
            )}

            {status !== "recovered" ? (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto min-h-11"
                onClick={() => void check()}
                disabled={checking}
              >
                <RefreshCw className={checking ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
                {checking ? "Checking…" : "Try again"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
