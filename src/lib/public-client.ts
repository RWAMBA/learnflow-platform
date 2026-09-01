/**
 * Browser-side transport for the anonymous public boundary.
 *
 * Bounded timeouts, AbortController cancellation and exponential backoff with
 * jitter — retries only for safe idempotent reads. Mutations are never retried
 * automatically, so a submission can never be silently duplicated. A 429 is
 * surfaced as a typed rate-limit result carrying a bounded countdown instead
 * of being treated as an outage.
 */
import { PUBLIC_ERROR } from "./public-site.constants";

export interface PublicApiFailure {
  ok: false;
  code: string;
  message: string;
  retryAfterSeconds?: number;
  fieldErrors?: Record<string, string>;
}

export type PublicApiResult<T> = ({ ok: true } & T) | PublicApiFailure;

const DEFAULT_TIMEOUT_MS = 12000;
const MAX_RETRY_AFTER = 3600;

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  constructor(
    private readonly threshold = 4,
    private readonly cooldownMs = 30000,
  ) {}

  get isOpen(): boolean {
    if (this.failures < this.threshold) return false;
    if (Date.now() - this.openedAt > this.cooldownMs) {
      this.failures = 0;
      return false;
    }
    return true;
  }
  recordFailure() {
    this.failures += 1;
    if (this.failures >= this.threshold) this.openedAt = Date.now();
  }
  recordSuccess() {
    this.failures = 0;
  }
}

export const healthBreaker = new CircuitBreaker();

function backoffDelay(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 8000);
  return base / 2 + Math.random() * (base / 2); // full-ish jitter
}

/** POST to a public endpoint. Never retried: mutations must not duplicate. */
export async function postPublic<T>(
  path: string,
  body: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<PublicApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);

  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      credentials: "same-origin",
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 429) {
      const header = Number(response.headers.get("retry-after") ?? "");
      const fromBody = (payload as { retryAfterSeconds?: number } | null)?.retryAfterSeconds;
      const seconds = Number.isFinite(header) && header > 0 ? header : (fromBody ?? 60);
      return {
        ok: false,
        code: PUBLIC_ERROR.rateLimited,
        message:
          (payload as { message?: string } | null)?.message ??
          "Too many requests. Please wait before trying again.",
        retryAfterSeconds: Math.min(Math.max(Math.ceil(seconds), 1), MAX_RETRY_AFTER),
      };
    }

    if (!response.ok || (payload as { ok?: boolean } | null)?.ok !== true) {
      const failure = payload as PublicApiFailure | null;
      return {
        ok: false,
        code: failure?.code ?? PUBLIC_ERROR.unavailable,
        message: failure?.message ?? "We could not complete that. Please try again.",
        ...(failure?.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}),
      };
    }

    return payload as PublicApiResult<T>;
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "TIMEOUT" : PUBLIC_ERROR.unavailable,
      message: aborted
        ? "That took too long. Check your connection and try again."
        : "We could not reach the service. Please try again.",
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

/** GET with bounded retries. Safe because the endpoint is read-only. */
export async function getPublic<T>(
  path: string,
  options: { retries?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T | null> {
  const retries = options.retries ?? 2;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort);
    try {
      const response = await fetch(path, { signal: controller.signal, credentials: "same-origin" });
      if (response.status === 429) return null; // never storm a throttled endpoint
      if (response.ok) return (await response.json()) as T;
    } catch {
      // fall through to the backoff below
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
  }
  return null;
}
