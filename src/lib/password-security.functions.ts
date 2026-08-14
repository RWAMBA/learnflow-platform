import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPasswordChangeLockout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./password-security.server");
    // Validate admin configuration before any lockout read/write.
    mod.assertLockoutServiceConfigured();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return await mod.readLockout(supabaseAdmin, context.userId);
    } catch (error) {
      if (error instanceof mod.LockoutServiceUnavailableError) throw error;
      mod.logLockoutDiagnostic("read-lockout", "admin-client-unavailable");
      throw new mod.LockoutServiceUnavailableError();
    }
  });

export const recordPasswordChangeFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./password-security.server");
    mod.assertLockoutServiceConfigured();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return await mod.registerFailure(supabaseAdmin, context.userId);
    } catch (error) {
      if (error instanceof mod.LockoutServiceUnavailableError) throw error;
      mod.logLockoutDiagnostic("register-failure", "admin-client-unavailable");
      throw new mod.LockoutServiceUnavailableError();
    }
  });

export const clearPasswordChangeFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mod = await import("./password-security.server");
    mod.assertLockoutServiceConfigured();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return await mod.clearFailures(supabaseAdmin, context.userId);
    } catch (error) {
      if (error instanceof mod.LockoutServiceUnavailableError) throw error;
      mod.logLockoutDiagnostic("clear-failures", "admin-client-unavailable");
      throw new mod.LockoutServiceUnavailableError();
    }
  });
