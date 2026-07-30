import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { QueryState } from "@/components/shared/query-state";
import { joinOrganization, listJoinableOrganizations } from "@/lib/onboarding.functions";
import { ROLE_LABELS } from "@/features/roles/types";

const SELECTABLE_ROLES = ["parent_guardian", "teacher", "tutor", "org_admin"] as const;
type SelectableRole = (typeof SELECTABLE_ROLES)[number];

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your account — the Platform" },
      { name: "description", content: "Join an organization and choose the roles you hold in it." },
      { property: "og:title", content: "Set up your account — the Platform" },
      { property: "og:description", content: "Join an organization and choose your roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listOrgs = useServerFn(listJoinableOrganizations);
  const join = useServerFn(joinOrganization);

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [roles, setRoles] = useState<SelectableRole[]>(["parent_guardian"]);

  const orgsQuery = useQuery({
    queryKey: ["joinable-organizations"],
    queryFn: () => listOrgs(),
  });

  const mutation = useMutation({
    mutationFn: () => join({ data: { organizationId: organizationId!, roleCodes: roles } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("You're all set.");
      await navigate({ to: "/dashboard" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Finish setting up</CardTitle>
          <CardDescription>
            Choose the organization you belong to and the roles you hold there. You can hold more
            than one role.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <QueryState
            isPending={orgsQuery.isPending}
            error={orgsQuery.error}
            data={orgsQuery.data}
            onRetry={() => void orgsQuery.refetch()}
          >
            {(organizations) => (
              <fieldset className="space-y-2">
                <legend className="mb-2 font-medium">Organization</legend>
                {organizations.map((organization) => (
                  <label
                    key={organization.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors duration-200 hover:bg-accent"
                  >
                    <input
                      type="radio"
                      name="organization"
                      value={organization.id}
                      checked={organizationId === organization.id}
                      onChange={() => setOrganizationId(organization.id)}
                      className="size-4 accent-[var(--color-primary)]"
                    />
                    <span>
                      <span className="block font-medium">{organization.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {organization.tenant_type.replace(/_/g, " ")}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </QueryState>

          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium">Your roles</legend>
            {SELECTABLE_ROLES.map((role) => (
              <div key={role} className="flex items-center gap-3">
                <Checkbox
                  id={`role-${role}`}
                  checked={roles.includes(role)}
                  onCheckedChange={(checked) =>
                    setRoles((current) =>
                      checked ? [...new Set([...current, role])] : current.filter((item) => item !== role),
                    )
                  }
                />
                <Label htmlFor={`role-${role}`}>{ROLE_LABELS[role]}</Label>
              </div>
            ))}
          </fieldset>

          <Button
            className="w-full"
            disabled={!organizationId || roles.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Setting up…" : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
