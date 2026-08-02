/**
 * Server-only preflight for the environment variables every server action
 * depends on. Never returns or logs values — only variable names and whether
 * they are present.
 */

import { REQUIRED_ENV, type EnvScope, type EnvVarStatus } from "./env-preflight-vars";

export type { EnvScope, EnvVarStatus };

export function inspectSupabaseEnv(): EnvVarStatus[] {
  return REQUIRED_ENV.map((entry) => ({
    ...entry,
    present: Boolean(process.env[entry.name]),
  }));
}

export function missingSupabaseEnv(scopes: EnvScope[] = ["core", "admin"]): EnvVarStatus[] {
  return inspectSupabaseEnv().filter((entry) => scopes.includes(entry.scope) && !entry.present);
}

export function formatMissingEnvMessage(missing: EnvVarStatus[]): string {
  const details = missing.map((entry) => `${entry.name} (${entry.purpose})`).join(", ");
  return `Supabase preflight failed — missing environment variable(s): ${details}. Reconnect Supabase / refresh the service-role binding in project settings, then restart the server.`;
}

/**
 * Throws with an explicit, actionable message listing every missing variable
 * at once instead of failing later on the first client that needs one.
 */
export function assertSupabaseEnv(scopes: EnvScope[] = ["core", "admin"]): void {
  const missing = missingSupabaseEnv(scopes);
  if (missing.length === 0) return;
  const message = formatMissingEnvMessage(missing);
  console.error(`[preflight] ${message}`);
  throw new Error(message);
}
