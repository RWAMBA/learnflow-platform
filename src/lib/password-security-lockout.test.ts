import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTEMPTS_BEFORE_COOLDOWN,
  COOLDOWN_STEPS,
  LOCKOUT_UNAVAILABLE_MESSAGE,
  LockoutServiceUnavailableError,
  assertLockoutServiceConfigured,
  clearFailures,
  readLockout,
  registerFailure,
} from "./password-security.server";

type Row = {
  user_id: string;
  failed_attempts: number;
  locked_until: string | null;
};

/** Minimal in-memory stand-in for the persisted attempts table. */
function createFakeAdmin(options: { failOn?: "select" | "upsert" } = {}) {
  const rows = new Map<string, Row>();
  const admin = {
    rows,
    from() {
      let filterId = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST query builders are deeply generic; narrowing here would duplicate the generated types without adding safety.
      const builder: any = {
        select: () => builder,
        eq: (_col: string, value: string) => {
          filterId = value;
          return builder;
        },
        maybeSingle: async () =>
          options.failOn === "select"
            ? { data: null, error: { message: "permission denied for relation" } }
            : { data: rows.get(filterId) ?? null, error: null },
        upsert: async (values: Row) => {
          if (options.failOn === "upsert") return { error: { message: "permission denied" } };
          rows.set(values.user_id, { ...values });
          return { error: null };
        },
      };
      return builder;
    },
  };
  return admin;
}

const USER = "11111111-1111-1111-1111-111111111111";

describe("password-change lockout persistence", () => {
  it("records failed attempts 1 and 2 without locking", async () => {
    const admin = createFakeAdmin();
    const first = await registerFailure(admin, USER);
    expect(first.failedAttempts).toBe(1);
    expect(first.lockedForSeconds).toBe(0);
    expect(first.cooldownSeconds).toBeNull();

    const second = await registerFailure(admin, USER);
    expect(second.failedAttempts).toBe(2);
    expect(second.lockedForSeconds).toBe(0);
    expect(second.cooldownSeconds).toBeNull();
  });

  it("locks on attempt 3 for the configured 30 seconds", async () => {
    const admin = createFakeAdmin();
    await registerFailure(admin, USER);
    await registerFailure(admin, USER);
    const third = await registerFailure(admin, USER);

    expect(ATTEMPTS_BEFORE_COOLDOWN).toBe(3);
    expect(COOLDOWN_STEPS[0]).toBe(30);
    expect(third.failedAttempts).toBe(3);
    expect(third.cooldownSeconds).toBe(30);
    expect(third.lockedForSeconds).toBe(30);
  });

  it("persists the lockout so a separate request reads it back", async () => {
    const admin = createFakeAdmin();
    await registerFailure(admin, USER);
    await registerFailure(admin, USER);
    await registerFailure(admin, USER);

    // Simulates a fresh request/page load: state comes from storage, not memory.
    const readBack = await readLockout(admin, USER);
    expect(readBack.failedAttempts).toBe(3);
    expect(readBack.lockedForSeconds).toBeGreaterThan(0);
    expect(readBack.lockedForSeconds).toBeLessThanOrEqual(30);
  });

  it("clears attempts after a successful verification", async () => {
    const admin = createFakeAdmin();
    await registerFailure(admin, USER);
    const cleared = await clearFailures(admin, USER);
    expect(cleared.failedAttempts).toBe(0);
    expect(cleared.lockedForSeconds).toBe(0);
    expect((await readLockout(admin, USER)).failedAttempts).toBe(0);
  });
});

describe("fail-closed behaviour", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("rejects when admin configuration is missing", () => {
    expect(() =>
      assertLockoutServiceConfigured({
        SUPABASE_URL: "https://x",
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      }),
    ).toThrow(LockoutServiceUnavailableError);
    expect(() =>
      assertLockoutServiceConfigured({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: "k" }),
    ).toThrow(LOCKOUT_UNAVAILABLE_MESSAGE);
    expect(() =>
      assertLockoutServiceConfigured({ SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k" }),
    ).not.toThrow();
  });

  it("surfaces a generic error when the lockout read fails", async () => {
    const admin = createFakeAdmin({ failOn: "select" });
    await expect(readLockout(admin, USER)).rejects.toThrow(LOCKOUT_UNAVAILABLE_MESSAGE);
  });

  it("surfaces a generic error when the lockout write fails", async () => {
    const admin = createFakeAdmin({ failOn: "upsert" });
    await expect(registerFailure(admin, USER)).rejects.toThrow(LockoutServiceUnavailableError);
  });

  it("never leaks configuration or database detail in the failure message", () => {
    expect(LOCKOUT_UNAVAILABLE_MESSAGE).not.toMatch(
      /SUPABASE|SERVICE_ROLE|password_change_attempts|permission/i,
    );
  });
});

describe("account security page contract", () => {
  const page = readFileSync(
    join(process.cwd(), "src", "routes", "_authenticated", "account.security.tsx"),
    "utf8",
  );

  it("shows the approved unavailable message", () => {
    expect(page).toContain(LOCKOUT_UNAVAILABLE_MESSAGE);
  });

  it("has no client-only attempt fallback", () => {
    expect(page).not.toMatch(/LOCAL_FALLBACK_COOLDOWN_SECONDS/);
    expect(page).not.toMatch(/failedAttempts \+ 1/);
  });

  it("keeps the success path intact", () => {
    expect(page).toContain("supabase.auth.updateUser({ password: values.password })");
    expect(page).toContain('toast.success("Password updated.")');
  });

  it("does not reference the service role key", () => {
    expect(page).not.toMatch(/SERVICE_ROLE/);
  });
});
