/**
 * Stage 2 — Programme product surface.
 *
 * These assertions cover the user-facing wiring: role-scoped views, the
 * server-function boundary for every mutation, destructive-action
 * confirmation, and the rule that academic programme labels are read from the
 * existing curriculum_enrollments rows rather than a duplicate model.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACADEMIC_PROGRAMME_LABELS,
  summarizeAcademicProgrammes,
} from "@/features/programmes/academic-summary";

const read = (path: string) => readFileSync(path, "utf8");

const INDEX = read("src/routes/_authenticated/programmes.index.tsx");
const DETAIL = read("src/routes/_authenticated/programmes.$programmeId.tsx");
const DIALOGS = read("src/features/programmes/components/programme-dialogs.tsx");
const API = read("src/features/programmes/api.ts");
const CONFIRM = read("src/features/programmes/components/confirm-action.tsx");
const SUMMARY_CARD = read("src/features/programmes/components/academic-summary-card.tsx");
const NAV = read("src/components/layout/main-nav.tsx");

const CLIENT_SURFACE = [INDEX, DETAIL, DIALOGS, API, CONFIRM, SUMMARY_CARD];

describe("Stage 2 — client write boundary", () => {
  it("never mutates a Stage 2 or curriculum enrollment table from the client graph", () => {
    for (const source of CLIENT_SURFACE) {
      for (const table of [
        "programmes",
        "programme_instructors",
        "programme_enrollments",
        "curriculum_enrollments",
      ]) {
        const pattern = new RegExp(
          `from\\("${table}"\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\(`,
        );
        expect(pattern.test(source)).toBe(false);
      }
    }
  });

  it("never imports a service-role client into the programme UI", () => {
    for (const source of CLIENT_SURFACE) {
      expect(source).not.toContain("client.server");
      expect(source).not.toContain("supabaseAdmin");
      expect(source).not.toContain("SERVICE_ROLE");
    }
  });

  it("routes every programme mutation through an authenticated server function", () => {
    for (const source of [INDEX, DETAIL, DIALOGS]) {
      const calls = source.match(/useServerFn\(/g) ?? [];
      const rpc = source.includes(".rpc(");
      expect(rpc).toBe(false);
      if (source.includes("useMutation")) expect(calls.length).toBeGreaterThan(0);
    }
    const functions = read("src/lib/programmes.functions.ts");
    const declarations = functions.match(/createServerFn\(/g) ?? [];
    const guards = functions.match(/requireSupabaseAuth/g) ?? [];
    // One import plus one middleware entry per declared server function.
    expect(guards.length).toBe(declarations.length + 1);
  });
});

describe("Stage 2 — role-scoped product surface", () => {
  it("gives administrators draft, published and archived views", () => {
    expect(INDEX).toContain("TabsTrigger");
    for (const value of ['value="draft"', 'value="published"', 'value="archived"']) {
      expect(INDEX).toContain(value);
    }
  });

  it("shows only published programmes to ordinary users", () => {
    expect(INDEX).toContain('const status = mayManage ? tab : "published"');
    expect(INDEX).toContain('useState<string>(mayManage ? ALL : "published")');
  });

  it("gates authoring controls behind canManageProgrammes", () => {
    expect(INDEX).toContain("canManageProgrammes");
    expect(DETAIL).toContain("canManageProgrammes");
    expect(DETAIL).toContain("canManageProgrammeEnrollments");
    expect(DETAIL).toContain("canEnrollInProgrammes");
  });

  it("exposes learner and family enrollment status and history", () => {
    expect(INDEX).toContain("listVisibleProgrammeEnrollments");
    expect(INDEX).toContain("Programme enrollments");
    expect(INDEX).toContain("PROGRAMME_ENROLLMENT_STATUS_LABELS");
  });

  it("keeps the programme route in role-aware navigation", () => {
    expect(NAV).toContain('to: "/programmes"');
  });
});

describe("Stage 2 — lifecycle controls", () => {
  it("wires publish, return-to-draft and archive to the server function", () => {
    expect(DETAIL).toContain("changeProgrammeStatus");
    expect(DETAIL).toContain('programmeStatusMutation.mutate("published")');
    expect(DETAIL).toContain('programmeStatusMutation.mutate("draft")');
    expect(DETAIL).toContain('programmeStatusMutation.mutate("archived")');
  });

  it("confirms archive, withdrawal and ending an instructor assignment", () => {
    expect(DETAIL).toContain("Archive this programme?");
    expect(DETAIL).toContain("Withdraw this learner?");
    expect(DETAIL).toContain("Archive this enrollment?");
    expect(DETAIL).toContain("End this instructor assignment?");
  });

  it("prevents duplicate submission on every mutating control", () => {
    expect(DETAIL).toContain("disabled={programmeStatusMutation.isPending}");
    expect(DETAIL).toContain("disabled={changeStatusMutation.isPending}");
    expect(DETAIL).toContain("disabled={endInstructorMutation.isPending}");
    expect(DIALOGS).toContain("disabled={mutation.isPending");
    expect(CONFIRM).toContain("disabled={pending}");
  });

  it("uses an accessible confirmation primitive with managed focus", () => {
    expect(CONFIRM).toContain("@/components/ui/alert-dialog");
    expect(CONFIRM).toContain("AlertDialogCancel");
  });
});

describe("Stage 2 — academic summaries", () => {
  it("labels academic programmes from the curriculum enrollment categories", () => {
    expect(ACADEMIC_PROGRAMME_LABELS.primary).toBe("Full-Time Homeschooling");
    expect(ACADEMIC_PROGRAMME_LABELS.supplementary).toBe("Part-Time Tuition");
  });

  it("counts distinct active learners per category", () => {
    const rows = [
      { student_id: "a", enrollment_category: "primary", status: "active" },
      { student_id: "a", enrollment_category: "primary", status: "ended" },
      { student_id: "b", enrollment_category: "primary", status: "active" },
      { student_id: "b", enrollment_category: "supplementary", status: "pending" },
    ];
    const [primary, supplementary] = summarizeAcademicProgrammes(rows);
    expect(primary.activeLearners).toBe(2);
    expect(primary.totalEnrollments).toBe(3);
    expect(supplementary.activeLearners).toBe(0);
    expect(supplementary.totalEnrollments).toBe(1);
  });

  it("reads the existing curriculum enrollment table, not a duplicate model", () => {
    expect(SUMMARY_CARD).toContain("listCurriculumEnrollments");
    expect(SUMMARY_CARD).not.toContain("academic_programmes");
  });
});

describe("Stage 2 — removed scope", () => {
  it("contains no certificate, credential or higher-learning surface", () => {
    const forbidden = [
      "certificate",
      "credential",
      "university",
      "tvet",
      "diploma",
      "career pathway",
      "career aspiration",
      "achievement badge",
    ];
    for (const source of CLIENT_SURFACE) {
      const lower = source.toLowerCase();
      const disclaimers = lower.split("no certificate is issued").length - 1;
      for (const term of forbidden) {
        const occurrences = lower.split(term).length - 1;
        expect(occurrences - (term === "certificate" ? disclaimers : 0)).toBe(0);
      }
    }
  });
});
