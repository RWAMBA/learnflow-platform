import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPasswordChangeLockout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { readLockout } = await import("./password-security.server");
    return readLockout(supabaseAdmin, context.userId);
  });

export const recordPasswordChangeFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { registerFailure } = await import("./password-security.server");
    return registerFailure(supabaseAdmin, context.userId);
  });

export const clearPasswordChangeFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clearFailures } = await import("./password-security.server");
    return clearFailures(supabaseAdmin, context.userId);
  });
