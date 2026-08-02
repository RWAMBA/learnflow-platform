import { createServerFn } from "@tanstack/react-start";
import { REQUIRED_ENV } from "./env-preflight-vars";

/**
 * Reports which server-side Supabase variables are configured. Returns only
 * names and booleans — never any secret value.
 */
export const getSupabaseEnvPreflight = createServerFn({ method: "GET" }).handler(async () => {
  const variables = REQUIRED_ENV.map((entry) => ({
    ...entry,
    present: Boolean(process.env[entry.name]),
  }));
  return {
    ok: variables.every((entry) => entry.present),
    missing: variables.filter((entry) => !entry.present).map(({ name, purpose }) => ({ name, purpose })),
    variables: variables.map(({ name, present, scope }) => ({ name, present, scope })),
  };
});
