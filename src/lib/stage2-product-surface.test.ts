/**
 * Stage 2 — Programme product surface.
 *
 * These assertions cover the user-facing wiring: role-scoped views, the
 * server-function boundary for every mutation, destructive-action
 * confirmation, and the rule that academic programme labels are read from the
 * existing curriculum_enrollments rows rather than a duplicate model.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

// ---------------------------------------------------------------- fixture attribution
describe("stage 2 programme_instructors principal fixtures", () => {
  const FIXTURE = readFileSync(
    resolve(process.cwd(), "scripts/rls/stage2-principal-tests.sql"),
    "utf8",
  );

  const inserts = [
    ...FIXTURE.matchAll(
      /INSERT INTO public\.programme_instructors\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/g,
    ),
  ].map((m) => ({
    columns: m[1].split(",").map((c) => c.trim()),
    values: m[2].split(",").map((v) => v.trim()),
  }));

  it("finds the instructor-assignment fixtures", () => {
    expect(inserts.length).toBeGreaterThanOrEqual(3);
  });

  it("never attributes an assignment to the assigned instructor, except in the explicit self-assignment denial", () => {
    const collisions = inserts.filter((i) => {
      const role = i.values[i.columns.indexOf("user_role_id")];
      const actor = i.values[i.columns.indexOf("created_by")];
      return role === "v_ur_teacher_linked" && actor === "v_teacher_linked";
    });
    // exactly one: the negative self-assignment proof
    expect(collisions).toHaveLength(1);
    expect(FIXTURE).toContain("DENY FAILED: a teacher assigned themselves as instructor");
  });

  it("attributes every positive assignment to the organization administrator fixture", () => {
    const positives = inserts.filter(
      (i) => i.values[i.columns.indexOf("created_by")] === "v_admin_a",
    );
    expect(positives.length).toBeGreaterThanOrEqual(2);
    expect(positives.map((p) => p.values[p.columns.indexOf("user_role_id")])).toContain(
      "v_ur_teacher_linked",
    );
  });

  it("accepts either fail-closed denial mode for teacher self-assignment", () => {
    expect(FIXTURE).toContain(
      "IF sqlerrm NOT LIKE '%cannot assign themselves%' THEN RAISE; END IF;",
    );
  });
});

// -------------------------------------------------- enrollment-history deletion proof
describe("stage 2 enrollment-history deletion proof", () => {
  const FIXTURE = readFileSync(
    resolve(process.cwd(), "scripts/rls/stage2-principal-tests.sql"),
    "utf8",
  );
  const BLOCK = FIXTURE.slice(
    FIXTURE.indexOf("history cannot be destroyed"),
    FIXTURE.indexOf("anonymous denial"),
  );

  it("isolates the deletion proof block", () => {
    expect(BLOCK.length).toBeGreaterThan(500);
  });

  it("records the affected row count instead of assuming an exception", () => {
    expect(BLOCK).toContain("GET DIAGNOSTICS v_deleted = ROW_COUNT");
    expect(BLOCK).not.toContain("DENY FAILED: an enrollment record was deleted");
  });

  it("treats any affected row as a security defect", () => {
    expect(BLOCK).toContain("SECURITY DEFECT: % deleted % enrollment row(s)");
    expect(BLOCK).toContain("IF v_deleted IS NULL OR v_deleted <> 0 THEN");
  });

  it("proves persistence through an observer that is not the denied caller", () => {
    expect(BLOCK).toContain("RESET ROLE;");
    expect(BLOCK).toContain("SECURITY DEFECT: the enrollment disappeared after the % attempt");
    expect(BLOCK).toContain("IF v_count <> 1 THEN");
  });

  it("exercises every role that must not be able to hard-delete history", () => {
    for (const label of [
      "'org admin'",
      "'teacher'",
      "'tutor'",
      "'guardian'",
      "'learner'",
      "'non-member'",
      "'cross-tenant admin'",
    ]) {
      expect(BLOCK).toContain(label);
    }
    for (const principal of [
      "v_admin_a",
      "v_teacher_linked",
      "v_tutor",
      "v_parent_full",
      "v_learner",
      "v_outsider",
      "v_admin_b",
    ]) {
      expect(BLOCK).toContain(principal);
    }
  });

  it("asserts the immutability trigger stays attached and enabled", () => {
    expect(BLOCK).toContain("programme_enrollments_no_delete");
    expect(BLOCK).toContain("t.tgenabled <> 'D'");
    expect(BLOCK).toContain(
      "IMMUTABILITY FAILED: the enrollment history delete trigger is missing or disabled",
    );
  });

  it("forbids a permissive DELETE policy on enrollment history", () => {
    expect(BLOCK).toContain("cmd IN ('DELETE', 'ALL')");
    expect(BLOCK).toContain("IMMUTABILITY FAILED: a DELETE policy exists on programme_enrollments");
  });

  it("keeps lifecycle changes to approved status transitions", () => {
    expect(BLOCK).toContain(
      "LIFECYCLE FAILED: the enrollment status changed during the deletion proof",
    );
  });

  it("still accepts the documented trigger rejection message", () => {
    expect(BLOCK).toContain("IF sqlerrm NOT LIKE '%cannot be deleted%' THEN RAISE; END IF;");
  });
});
