/**
 * Metadata only (names, scopes, purposes) — no values, so this module is safe
 * to import from anywhere, including the server-function wrapper.
 */
export type EnvScope = "core" | "admin";

export interface EnvVarStatus {
  name: string;
  present: boolean;
  scope: EnvScope;
  purpose: string;
}

export const REQUIRED_ENV: Array<{ name: string; scope: EnvScope; purpose: string }> = [
  { name: "SUPABASE_URL", scope: "core", purpose: "Server-side Supabase API endpoint" },
  {
    name: "SUPABASE_PUBLISHABLE_KEY",
    scope: "core",
    purpose: "Authenticated server functions (RLS as the signed-in user)",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    scope: "admin",
    purpose: "Privileged operations such as onboarding organization lookup",
  },
];