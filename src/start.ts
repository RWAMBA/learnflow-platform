import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { requiresOriginValidation } from "./lib/origin-policy";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Runs before every server function: fails fast with an explicit list of the
// missing Supabase variables instead of an opaque error from the first client
// that happens to need one.
const envPreflightMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { assertSupabaseEnv } = await import("./lib/env-preflight.server");
  assertSupabaseEnv(["core"]);
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly. Beyond the default it also covers
// state-changing server-route requests (see src/lib/origin-policy.ts), and it
// refuses requests that carry no origin signal at all — the default already
// fails closed there, and `allowRequestsWithoutOriginCheck` stays unset.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) =>
    requiresOriginValidation({
      handlerType: ctx.handlerType,
      method: ctx.request.method,
      pathname: new URL(ctx.request.url).pathname,
    }),
});

export const startInstance = createStart(() => ({
  functionMiddleware: [envPreflightMiddleware, attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
