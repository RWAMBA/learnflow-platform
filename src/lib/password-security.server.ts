// Server-side lockout state for the change-password flow. Persisted in the
// database so a page refresh cannot bypass the cooldown.
export const ATTEMPTS_BEFORE_COOLDOWN = 3;
export const COOLDOWN_STEPS = [30, 60, 300] as const;

export type LockoutState = {
  failedAttempts: number;
  lockedForSeconds: number;
  cooldownSeconds: number | null;
};

function remainingSeconds(lockedUntil: string | null | undefined): number {
  if (!lockedUntil) return 0;
  const ms = new Date(lockedUntil).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

type AdminClient = {
  from: (table: string) => any;
};

export async function readLockout(admin: AdminClient, userId: string): Promise<LockoutState> {
  const { data, error } = await admin
    .from("password_change_attempts")
    .select("failed_attempts, locked_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const lockedForSeconds = remainingSeconds(data?.locked_until ?? null);
  return {
    failedAttempts: lockedForSeconds > 0 ? (data?.failed_attempts ?? 0) : (data?.failed_attempts ?? 0),
    lockedForSeconds,
    cooldownSeconds: null,
  };
}

export async function registerFailure(admin: AdminClient, userId: string): Promise<LockoutState> {
  const current = await readLockout(admin, userId);
  if (current.lockedForSeconds > 0) return current;

  const attempts = current.failedAttempts + 1;
  let cooldownSeconds: number | null = null;
  let lockedUntil: string | null = null;

  if (attempts >= ATTEMPTS_BEFORE_COOLDOWN) {
    const step = Math.min(attempts - ATTEMPTS_BEFORE_COOLDOWN, COOLDOWN_STEPS.length - 1);
    cooldownSeconds = COOLDOWN_STEPS[step]!;
    lockedUntil = new Date(Date.now() + cooldownSeconds * 1000).toISOString();
  }

  const { error } = await admin.from("password_change_attempts").upsert(
    {
      user_id: userId,
      failed_attempts: attempts,
      locked_until: lockedUntil,
      last_failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);

  return {
    failedAttempts: attempts,
    lockedForSeconds: cooldownSeconds ?? 0,
    cooldownSeconds,
  };
}

export async function clearFailures(admin: AdminClient, userId: string): Promise<LockoutState> {
  const { error } = await admin.from("password_change_attempts").upsert(
    {
      user_id: userId,
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  return { failedAttempts: 0, lockedForSeconds: 0, cooldownSeconds: null };
}
