import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { RoleProvider } from "@/features/roles/role-context";
import { MFA_ENFORCEMENT_ENABLED, isGuardExempt } from "@/features/security/mfa";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    if (!data.user.email_confirmed_at && !data.user.confirmed_at) {
      throw redirect({ to: "/auth" });
    }
    // SEC-006: mandatory MFA is inert until enforcement is activated. The
    // enrollment and challenge routes are always exempt, so neither can
    // redirect to itself and password recovery/sign-out stay reachable.
    if (MFA_ENFORCEMENT_ENABLED && !isGuardExempt(location.pathname)) {
      const { resolveMfaGuard } = await import("@/features/security/mfa");
      const { readMfaStatus, readMandatoryMfa } = await import("@/features/security/mfa-client");
      // Mandatory only for the roles the policy evaluator marks as privileged;
      // Parent/Guardian and Student are never gated. Read failures fail closed
      // to mandatory, which routes to enrollment and grants nothing.
      const [status, mandatory] = await Promise.all([
        readMfaStatus(),
        readMandatoryMfa(data.user.id),
      ]);
      const decision = resolveMfaGuard({
        enforcementEnabled: true,
        mandatory,
        pathname: location.pathname,
        status,
      });
      if (decision.action === "redirect") {
        throw redirect({
          to: decision.to,
          ...(decision.redirect ? { search: { redirect: decision.redirect } } : {}),
        });
      }
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();

  return (
    <RoleProvider userId={user.id}>
      <DashboardShell>
        <Outlet />
      </DashboardShell>
    </RoleProvider>
  );
}
