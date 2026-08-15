import { describe, expect, it, vi } from "vitest";
import {
  adminResetTargetFactors,
  assertAal2,
  claimsHaveAal2,
  isActivePlatformAdmin,
  MfaAssuranceError,
  readOrganizationMfaPolicy,
} from "./mfa-policy.server";

describe("claimsHaveAal2", () => {
  it.each([
    ["missing", undefined],
    ["null", null],
    ["not an object", "aal2"],
    ["empty", {}],
    ["malformed aal", { aal: 2 }],
    ["null aal", { aal: null }],
    ["aal1", { aal: "aal1" }],
    ["mixed case", { aal: "AAL2" }],
  ])("fails closed for %s claims", (_label, claims) => {
    expect(claimsHaveAal2(claims)).toBe(false);
    expect(() => assertAal2(claims)).toThrow(MfaAssuranceError);
  });

  it("accepts an exact aal2 string claim", () => {
    expect(claimsHaveAal2({ aal: "aal2" })).toBe(true);
    expect(() => assertAal2({ aal: "aal2" })).not.toThrow();
  });
});

function tableClient(result: { data?: unknown; error?: unknown }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
  };
  return { from: () => builder } as never;
}

describe("isActivePlatformAdmin", () => {
  it("is true only for an active row", async () => {
    await expect(isActivePlatformAdmin(tableClient({ data: { id: "x" } }), "u")).resolves.toBe(true);
  });

  it("fails closed on read error", async () => {
    await expect(isActivePlatformAdmin(tableClient({ error: { message: "x" } }), "u")).resolves.toBe(
      false,
    );
  });
});

describe("readOrganizationMfaPolicy", () => {
  it("defaults to optional Teacher/Tutor MFA when no row exists", async () => {
    await expect(readOrganizationMfaPolicy(tableClient({}), "org")).resolves.toEqual({
      teacherMfaRequired: false,
      tutorMfaRequired: false,
    });
  });
});

describe("adminResetTargetFactors", () => {
  const adminClient = (factors: Array<{ id: string }>) => ({
    from: () => ({ insert: async () => ({ error: null }) }),
    auth: {
      admin: {
        mfa: {
          listFactors: vi.fn(async () => ({ data: { factors }, error: null })),
          deleteFactor: vi.fn(async () => ({ data: null, error: null })),
        },
      },
    },
  });

  it("refuses self-reset", async () => {
    await expect(
      adminResetTargetFactors(adminClient([]) as never, {
        actorUserId: "same",
        targetUserId: "same",
      }),
    ).rejects.toBeInstanceOf(MfaAssuranceError);
  });

  it("removes every factor of the target", async () => {
    const client = adminClient([{ id: "a" }, { id: "b" }]);
    await expect(
      adminResetTargetFactors(client as never, { actorUserId: "admin", targetUserId: "target" }),
    ).resolves.toEqual({ removedFactorCount: 2 });
    expect(client.auth.admin.mfa.deleteFactor).toHaveBeenCalledTimes(2);
  });
});
