/**
 * Shared, side-effect-free status policy for the public shell.
 *
 * Polling cadence and — critically — the classification of a health response.
 * A throttled (HTTP 429) reply is NOT a backend outage: it means the public
 * rate limiter did its job. Treating it as an outage is what produced the
 * false "trouble reaching our service" banner, so the distinction lives here
 * where it can be unit-tested without a browser.
 */
export const HEALTHY_POLL_MS = 30_000;
export const DEGRADED_POLL_MS = 10_000;
export const MAX_DEGRADED_POLL_MS = 60_000;

/** Upper bound for honouring a server-supplied retry hint, in seconds. */
export const MAX_THROTTLE_BACKOFF_SECONDS = 300;

export type HealthProbe =
  | { kind: "ok" }
  /** Rate limited. Not an outage: the last known state must be preserved. */
  | { kind: "throttled"; retryAfterSeconds: number }
  /** The backend answered and reported itself unhealthy. */
  | { kind: "degraded" }
  /** No usable answer at all (network error, timeout, unexpected shape). */
  | { kind: "unreachable" };

export function statusPollDelay(failures: number, random = Math.random): number {
  if (failures <= 0) return HEALTHY_POLL_MS;
  const base = Math.min(DEGRADED_POLL_MS * 2 ** (failures - 1), MAX_DEGRADED_POLL_MS);
  return Math.min(Math.round(base * (0.8 + random() * 0.4)), MAX_DEGRADED_POLL_MS);
}

/**
 * Classify a health reply. `body` is whatever JSON parsed, or null.
 * No diagnostic detail from the server is trusted beyond `status`.
 */
export function classifyHealthResponse(
  httpStatus: number,
  body: unknown,
  retryAfterHeader?: string | null,
): HealthProbe {
  if (httpStatus === 429) {
    const fromHeader = Number(retryAfterHeader ?? "");
    const fromBody = (body as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
    const raw =
      Number.isFinite(fromHeader) && fromHeader > 0
        ? fromHeader
        : typeof fromBody === "number" && Number.isFinite(fromBody)
          ? fromBody
          : 30;
    return {
      kind: "throttled",
      retryAfterSeconds: Math.min(Math.max(Math.ceil(raw), 1), MAX_THROTTLE_BACKOFF_SECONDS),
    };
  }

  const reported = (body as { status?: unknown } | null)?.status;
  if (httpStatus === 200 && reported === "ok") return { kind: "ok" };
  if (reported === "degraded") return { kind: "degraded" };
  if (httpStatus >= 500) return { kind: "degraded" };
  return { kind: "unreachable" };
}

/** Delay before the next probe when the limiter asked us to wait. */
export function throttleRetryDelay(retryAfterSeconds: number): number {
  return Math.min(Math.max(retryAfterSeconds, 1) * 1000, MAX_THROTTLE_BACKOFF_SECONDS * 1000);
}
