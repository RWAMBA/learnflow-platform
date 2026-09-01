/**
 * Shared public-form primitives.
 *
 * Public submissions are never optimistic: the UI can only show "sending" and
 * must wait for a committed server result before claiming success. A 429 is
 * handled as its own state — values are preserved, an accessible countdown
 * runs, submission is disabled until it expires, and nothing retries by itself.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { postPublic, type PublicApiFailure } from "@/lib/public-client";
import { PUBLIC_ERROR } from "@/lib/public-site.constants";

export type SubmitState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; reference?: string }
  | { kind: "error"; message: string; code: string; fieldErrors?: Record<string, string> }
  | { kind: "rateLimited"; message: string; secondsLeft: number };

export function usePublicSubmission<T extends { reference?: string }>(path: string) {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearInterval(tickRef.current);
    },
    [],
  );

  const startCountdown = useCallback((seconds: number, message: string) => {
    clearInterval(tickRef.current);
    let left = seconds;
    setState({ kind: "rateLimited", message, secondsLeft: left });
    tickRef.current = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(tickRef.current);
        setState({ kind: "idle" });
      } else {
        setState({ kind: "rateLimited", message, secondsLeft: left });
      }
    }, 1000);
  }, []);

  const submit = useCallback(
    async (body: unknown) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ kind: "pending" });

      const result = await postPublic<T>(path, body, { signal: controller.signal });

      if (result.ok) {
        setState({ kind: "success", reference: (result as T).reference });
        return result;
      }
      const failure = result as PublicApiFailure;
      if (failure.code === PUBLIC_ERROR.rateLimited) {
        startCountdown(failure.retryAfterSeconds ?? 60, failure.message);
        return failure;
      }
      setState({
        kind: "error",
        message: failure.message,
        code: failure.code,
        ...(failure.fieldErrors ? { fieldErrors: failure.fieldErrors } : {}),
      });
      return failure;
    },
    [path, startCountdown],
  );

  const reset = useCallback(() => {
    clearInterval(tickRef.current);
    setState({ kind: "idle" });
  }, []);

  return { state, submit, reset };
}

export function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            {" *"}
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </Label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(error ? { "aria-invalid": true } : {}),
      })}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Honeypot: visually hidden, never announced, and rejected server-side if filled. */
export function Honeypot({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
      <label htmlFor="website">Leave this field empty</label>
      <input
        id="website"
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function SubmissionStatus({ state }: { state: SubmitState }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="min-h-6">
      {state.kind === "pending" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Sending your message. Please wait — do not refresh.
        </p>
      ) : null}

      {state.kind === "rateLimited" ? (
        <p className="text-sm font-medium text-destructive">
          {state.message} You can try again in {state.secondsLeft} second
          {state.secondsLeft === 1 ? "" : "s"}.
        </p>
      ) : null}

      {state.kind === "error" ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

export function SuccessPanel({
  title,
  description,
  reference,
}: {
  title: string;
  description: string;
  reference?: string;
}) {
  return (
    <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/5 p-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {reference ? (
            <p className="mt-3 text-sm">
              Your reference: <span className="font-mono font-medium">{reference}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SubmitButton({
  state,
  disabled,
  children,
}: {
  state: SubmitState;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const busy = state.kind === "pending";
  const blocked = state.kind === "rateLimited";
  return (
    <Button type="submit" className="min-h-11" disabled={busy || blocked || disabled}>
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {busy ? "Sending…" : blocked ? `Please wait ${state.secondsLeft}s` : children}
    </Button>
  );
}
