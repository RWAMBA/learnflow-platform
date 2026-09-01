/**
 * Cloudflare Turnstile widget.
 *
 * Classified as strictly necessary fraud protection and therefore loaded only
 * on the public pages that carry a form — never on authenticated learner
 * routes. Only the public site key reaches the browser; verification happens
 * server-side against the secret. When no site key is configured the widget
 * reports "not configured" so the surrounding form can fail closed rather than
 * pretending a submission would succeed.
 */
import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
        },
      ) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function useTurnstileConfigured(): boolean {
  return Boolean(import.meta.env['VITE_TURNSTILE_SITE_KEY']);
}

export function Turnstile({
  onToken,
  className,
}: {
  onToken: (token: string | null) => void;
  className?: string;
}) {
  const siteKey = import.meta.env['VITE_TURNSTILE_SITE_KEY'] as string | undefined;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const labelId = useId();

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => {
          setFailed(true);
          onToken(null);
        },
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      const script = existing ?? document.createElement("script");
      if (!existing) {
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
      script.addEventListener("error", () => setFailed(true));
    }

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, onToken]);

  if (!siteKey) {
    return (
      <p role="status" className={className ?? "text-sm text-muted-foreground"}>
        Form protection is not configured yet, so this form cannot be sent. Please contact us by
        email in the meantime.
      </p>
    );
  }

  return (
    <div className={className}>
      <span id={labelId} className="sr-only">
        Security check
      </span>
      <div ref={containerRef} aria-labelledby={labelId} />
      {failed ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          The security check could not load. Refresh the page and try again.
        </p>
      ) : null}
    </div>
  );
}
