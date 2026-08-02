import { createFileRoute } from "@tanstack/react-router";

import { REQUIRED_ENV } from "@/lib/env-preflight-vars";

/**
 * Plain HTTP endpoint (not a server function) on purpose: this is the
 * diagnostic that must keep answering while server-function middleware is
 * failing because the environment is misconfigured.
 * Returns only variable names and booleans — never a secret value.
 */
export const Route = createFileRoute("/api/env-preflight")({
  server: {
    handlers: {
      GET: async () => {
        const variables = REQUIRED_ENV.map((entry) => ({
          ...entry,
          present: Boolean(process.env[entry.name]),
        }));
        return Response.json(
          {
            ok: variables.every((entry) => entry.present),
            missing: variables
              .filter((entry) => !entry.present)
              .map(({ name, purpose }) => ({ name, purpose })),
            variables: variables.map(({ name, present, scope }) => ({ name, present, scope })),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
