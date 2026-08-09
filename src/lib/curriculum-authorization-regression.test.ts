import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const migrationPath = resolve(
  root,
  "supabase/migrations/20260809194700_harden_curriculum_authorization.sql",
);

const migration = readFileSync(migrationPath, "utf8");

const permissions = readFileSync(
  resolve(root, "src/features/roles/permissions.ts"),
  "utf8",
);

const curriculumApi = readFileSync(
  resolve(root, "src/features/curriculum/api.ts"),
  "utf8",
);

const gradeRoute = readFileSync(
  resolve(
    root,
    "src/routes/_authenticated/curriculum.grades.$gradeId.tsx",
  ),
  "utf8",
);

const subjectRoute = readFileSync(
  resolve(
    root,
    "src/routes/_authenticated/curriculum.subjects.$subjectId.tsx",
  ),
  "utf8",
);

const lessonRoute = readFileSync(
  resolve(
    root,
    "src/routes/_authenticated/curriculum.lessons.$lessonId.tsx",
  ),
  "utf8",
);

const versionsRoute = readFileSync(
  resolve(root, "src/routes/_authenticated/curriculum.versions.tsx"),
  "utf8",
);

function policy(name: string) {
  const expression = new RegExp(
    `CREATE POLICY ${name}\\b[\\s\\S]*?;`,
  );

  const match = migration.match(expression);

  expect(
    match,
    `Expected migration to define policy ${name}`,
  ).not.toBeNull();

  return match![0];
}

function functionBody(name: string) {
  const expression = new RegExp(
    `CREATE OR REPLACE FUNCTION ${name.replaceAll(".", "\\.")}` +
      `[\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
  );

  const match = migration.match(expression);

  expect(
    match,
    `Expected migration to define function ${name}`,
  ).not.toBeNull();

  return match![1];
}

function collectSourceFiles(directory: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry)) continue;

    if (entry === "curriculum-authorization-regression.test.ts") {
      continue;
    }

    results.push(fullPath);
  }

  return results;
}

describe("SEC-004 / SEC-005 curriculum authorization remediation", () => {
  it("applies the curriculum authorization migration atomically", () => {
    expect(migration.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(migration.trimEnd().endsWith("COMMIT;")).toBe(true);

    expect(migration.match(/^BEGIN;$/gm) ?? []).toHaveLength(1);
    expect(migration.match(/^COMMIT;$/gm) ?? []).toHaveLength(1);
  });

  it("removes Teacher and Tutor from tenant curriculum authoring", () => {
    const helper = functionBody(
      "app_private.can_author_curriculum",
    );

    expect(helper).toContain(
      "app_private.has_org_role(p_org_id, 'org_admin')",
    );

    expect(helper).not.toMatch(/\bteacher\b/);
    expect(helper).not.toMatch(/\btutor\b/);

    const tenantUiHelper =
      permissions.match(
        /export const canAuthorTenantCurriculum[\s\S]*?;\n/,
      )?.[0] ?? "";

    expect(tenantUiHelper).toContain('role === "org_admin"');
    expect(tenantUiHelper).not.toContain('"teacher"');
    expect(tenantUiHelper).not.toContain('"tutor"');
  });

  it("grants authenticated RLS policies EXECUTE on the narrowed authoring helper", () => {
    expect(migration).toContain(
      "REVOKE ALL\nON FUNCTION app_private.can_author_curriculum(uuid)\nFROM PUBLIC;",
    );

    expect(migration).toContain(
      "GRANT EXECUTE\nON FUNCTION app_private.can_author_curriculum(uuid)\nTO authenticated;",
    );
  });

  it("restricts platform structural curriculum writes to Platform Administrators", () => {
    const platformWritePolicies = [
      "curriculum_versions_insert",
      "curriculum_versions_update",
      "curriculum_versions_delete",
      "pathways_insert",
      "pathways_update",
      "pathways_delete",
      "subjects_insert",
      "subjects_update",
      "subjects_delete",
      "topics_insert",
      "topics_update",
      "topics_delete",
      "strands_insert",
      "strands_update",
      "strands_delete",
      "sub_strands_insert",
      "sub_strands_update",
      "sub_strands_delete",
      "learning_outcomes_write",
    ];

    for (const policyName of platformWritePolicies) {
      expect(policy(policyName)).toContain(
        "app_private.is_platform_admin()",
      );
    }

    expect(policy("curriculum_versions_insert")).toContain(
      "organization_id IS NULL",
    );

    for (const policyName of [
      "pathways_insert",
      "subjects_insert",
      "topics_insert",
      "strands_insert",
      "sub_strands_insert",
      "learning_outcomes_write",
    ]) {
      expect(policy(policyName)).toContain(
        "authoring_organization_id IS NULL",
      );
    }
  });

  it("hides platform drafts from ordinary authenticated users", () => {
    const selectPolicies = [
      "curriculum_versions_select",
      "pathways_select",
      "subjects_select",
      "topics_select",
      "strands_select",
      "sub_strands_select",
      "learning_outcomes_select",
    ];

    for (const policyName of selectPolicies) {
      const block = policy(policyName);

      expect(block).toContain("status = 'published'");
      expect(block).toContain(
        "app_private.is_platform_admin()",
      );
    }
  });

  it("keeps published tenant Lessons isolated to their organization", () => {
    const lessonSelect = policy("lessons_select");

    expect(lessonSelect).toContain(
      "author_type = 'platform'",
    );
    expect(lessonSelect).toContain(
      "author_type = 'tenant'",
    );
    expect(lessonSelect).toContain(
      "app_private.auth_organization_ids()",
    );

    // The only published bypass belongs to the platform branch.
    expect(
      lessonSelect.match(/status = 'published'/g) ?? [],
    ).toHaveLength(1);

    expect(lessonSelect).not.toMatch(
      /author_type = 'tenant'[\s\S]*?status = 'published'/,
    );
  });

  it("makes Lesson ownership explicit and immutable", () => {
    expect(migration).toContain(
      "lessons_author_ownership_check",
    );

    expect(migration).toContain(
      "author_type = 'platform'",
    );
    expect(migration).toContain(
      "authoring_organization_id IS NULL",
    );

    expect(migration).toContain(
      "author_type = 'tenant'",
    );
    expect(migration).toContain(
      "authoring_organization_id IS NOT NULL",
    );

    expect(migration).toContain(
      "CREATE TRIGGER lessons_ownership_immutable",
    );

    const guard = functionBody(
      "app_private.prevent_lesson_ownership_change",
    );

    expect(guard).toContain(
      "NEW.author_type IS DISTINCT FROM OLD.author_type",
    );

    expect(guard).toContain(
      "NEW.authoring_organization_id",
    );

    expect(guard).toContain(
      "IS DISTINCT FROM OLD.authoring_organization_id",
    );
  });

  it("makes curriculum-resource ownership immutable", () => {
    expect(migration).toContain(
      "CREATE TRIGGER curriculum_resources_ownership_immutable",
    );

    const guard = functionBody(
      "app_private.prevent_curriculum_resource_ownership_change",
    );

    expect(guard).toContain(
      "NEW.organization_id IS DISTINCT FROM OLD.organization_id",
    );
  });

  it("restricts tenant resource metadata and Storage writes to the narrowed authoring helper", () => {
    const metadataPolicy = policy(
      "curriculum_resources_write",
    );

    expect(metadataPolicy).toContain(
      "app_private.can_author_curriculum",
    );

    for (const policyName of [
      "curriculum_resources_insert",
      "curriculum_resources_update",
      "curriculum_resources_delete",
    ]) {
      const storagePolicy = policy(policyName);

      expect(storagePolicy).toContain(
        "bucket_id = 'curriculum-resources'",
      );

      expect(storagePolicy).toContain(
        "app_private.can_author_curriculum",
      );
    }
  });

  it("propagates tenant-safe Lesson visibility to Lesson children", () => {
    for (const policyName of [
      "learning_objectives_select",
      "lesson_prerequisites_select",
    ]) {
      const block = policy(policyName);

      expect(block).toContain(
        "l.author_type = 'tenant'",
      );

      expect(block).toContain(
        "app_private.auth_organization_ids()",
      );

      expect(
        block.match(/l.status = 'published'/g) ?? [],
      ).toHaveLength(1);
    }
  });

  it("exposes Lesson ownership to the UI authorization layer", () => {
    expect(
      curriculumApi.match(
        /author_type, authoring_organization_id/g,
      ) ?? [],
    ).toHaveLength(2);

    expect(subjectRoute).toContain(
      'authorType="platform"',
    );

    expect(subjectRoute).toContain(
      'authorType="tenant"',
    );

    expect(subjectRoute).toContain(
      'lesson.author_type === "platform"',
    );

    expect(subjectRoute).toContain(
      'lesson.author_type === "tenant"',
    );

    expect(lessonRoute).toContain(
      'query.data?.lesson?.author_type === "platform"',
    );

    expect(lessonRoute).toContain(
      'query.data?.lesson?.author_type === "tenant"',
    );
  });

  it("uses the separate Platform Administrator capability for structural routes", () => {
    expect(gradeRoute).toContain(
      "canAuthorPlatformCurriculum(viewer.isPlatformAdmin)",
    );

    expect(versionsRoute).toContain(
      "canAuthorPlatformCurriculum(viewer.isPlatformAdmin)",
    );

    expect(subjectRoute).toContain(
      "canAuthorPlatformCurriculum",
    );

    expect(lessonRoute).toContain(
      "canAuthorPlatformCurriculum",
    );
  });

  it("contains no stale broad curriculum-authoring helper or invalid Lesson author type", () => {
    const sourceText = collectSourceFiles(
      resolve(root, "src"),
    )
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(sourceText).not.toContain(
      "canAuthorCurriculum",
    );

    expect(sourceText).not.toContain(
      'author_type: "organization"',
    );
  });
});
