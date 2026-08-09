import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryState } from "@/components/shared/query-state";
import { joinOrganization, listJoinableOrganizations } from "@/lib/onboarding.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your account — the Platform" },
      { name: "description", content: "Join an organization and finish setting up your account." },
      { property: "og:title", content: "Set up your account — the Platform" },
      {
        property: "og:description",
        content: "Join an organization and finish setting up your account.",
      },
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

  const orgsQuery = useQuery({
    queryKey: ["joinable-organizations"],
    queryFn: () => listOrgs(),
  });

  const mutation = useMutation({
    mutationFn: () => join({ data: { organizationId: organizationId! } }),
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
            Choose the organization you belong to. Self-service onboarding creates a Parent/Guardian
            account. Other roles are assigned by an administrator.
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

          <Button
            className="w-full"
            disabled={!organizationId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Setting up…" : "Continue"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
