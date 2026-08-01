import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
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
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [envPreflightMiddleware, attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
