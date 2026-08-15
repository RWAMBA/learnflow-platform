import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ShieldAlert } from "lucide-react";
import { useRoleContext } from "@/features/roles/role-context";
import { canAuthorAssessments } from "@/features/roles/permissions";
import { AssessmentForm } from "@/features/assessments/components/assessment-form";

const TITLE = "New assessment — the Platform";
const DESCRIPTION = "Build an assessment linked to the curriculum hierarchy.";

export const Route = createFileRoute("/_authenticated/assessments/new")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { activeRole } = useRoleContext();
  const navigate = useNavigate();

  if (!activeRole || !canAuthorAssessments(activeRole.roleCode)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Not available for this role"
        description="Only teachers, tutors and organization administrators may author assessments."
      />
    );
  }

  return (
    <div>
      <PageHeader title="New assessment" description={DESCRIPTION} />
      <AssessmentForm
        organizationId={activeRole.organizationId}
        onSaved={(assessmentId) =>
          void navigate({ to: "/assessments/$assessmentId", params: { assessmentId } })
        }
      />
    </div>
  );
}
