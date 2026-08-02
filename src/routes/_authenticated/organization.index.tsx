import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { QueryState } from "@/components/shared/query-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoleContext } from "@/features/roles/role-context";
import {
  getOrganization,
  listOrganizationMembers,
  organizationKeys,
} from "@/features/organization/api";
import { setMemberRoleStatus, updateOrganizationSettings } from "@/lib/organization.functions";
import { ROLE_LABELS, type RoleCode } from "@/features/roles/types";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/organization/")({
  head: () => ({
    meta: [
      { title: "Organization — the Platform" },
      { name: "description", content: "Members, roles and organization settings." },
      { property: "og:title", content: "Organization — the Platform" },
      { property: "og:description", content: "Members, roles and organization settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const MEMBER_STATUSES = ["active", "suspended", "revoked"] as const;

function Page() {
  const { activeRole } = useRoleContext();
  const queryClient = useQueryClient();
  const organizationId = activeRole?.organizationId ?? "";
  const isAdmin = activeRole?.roleCode === "org_admin";

  const organization = useQuery({
    queryKey: organizationKeys.detail(organizationId),
    queryFn: () => getOrganization(organizationId),
    enabled: Boolean(organizationId),
  });

  const members = useQuery({
    queryKey: organizationKeys.members(organizationId),
    queryFn: () => listOrganizationMembers(organizationId),
    enabled: Boolean(organizationId),
  });

  const [form, setForm] = useState({
    name: "",
    timezone: "",
    defaultCurrency: "",
    defaultLocale: "",
    openEnrollment: false,
    youngerStudentIndependentLogin: false,
  });

  useEffect(() => {
    const data = organization.data;
    if (!data) return;
    setForm({
      name: data.name,
      timezone: data.timezone,
      defaultCurrency: data.default_currency,
      defaultLocale: data.default_locale,
      openEnrollment: data.open_enrollment,
      youngerStudentIndependentLogin: data.younger_student_independent_login,
    });
  }, [organization.data]);

  const save = useMutation({
    mutationFn: () => updateOrganizationSettings({ data: { organizationId, ...form } }),
    onSuccess: () => {
      toast.success("Organization settings saved");
      void queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeStatus = useMutation({
    mutationFn: (input: { userRoleId: string; status: (typeof MEMBER_STATUSES)[number] }) =>
      setMemberRoleStatus({ data: { organizationId, ...input } }),
    onSuccess: () => {
      toast.success("Member updated");
      void queryClient.invalidateQueries({ queryKey: organizationKeys.members(organizationId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title={activeRole?.organizationName ?? "Organization"}
        description="Members, roles and organization settings."
        actions={
          <Button asChild variant="outline">
            <Link to="/organization/billing">Plan &amp; billing</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryState
            isPending={organization.isPending}
            error={organization.error}
            data={organization.data}
            onRetry={() => void organization.refetch()}
          >
            {() => (
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  save.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization name</Label>
                  <Input
                    id="org-name"
                    value={form.name}
                    disabled={!isAdmin}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-timezone">Timezone</Label>
                  <Input
                    id="org-timezone"
                    value={form.timezone}
                    disabled={!isAdmin}
                    onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-currency">Default currency</Label>
                  <Input
                    id="org-currency"
                    maxLength={3}
                    value={form.defaultCurrency}
                    disabled={!isAdmin}
                    onChange={(event) =>
                      setForm({ ...form, defaultCurrency: event.target.value.toUpperCase() })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-locale">Default locale</Label>
                  <Input
                    id="org-locale"
                    value={form.defaultLocale}
                    disabled={!isAdmin}
                    onChange={(event) => setForm({ ...form, defaultLocale: event.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
                  <div>
                    <p className="font-medium">Open enrollment</p>
                    <p className="text-sm text-muted-foreground">
                      Allow people with the join link to add themselves to this organization.
                    </p>
                  </div>
                  <Switch
                    checked={form.openEnrollment}
                    disabled={!isAdmin}
                    aria-label="Open enrollment"
                    onCheckedChange={(checked) => setForm({ ...form, openEnrollment: checked })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
                  <div>
                    <p className="font-medium">Independent login below grade 10</p>
                    <p className="text-sm text-muted-foreground">
                      By default only senior secondary students sign in on their own.
                    </p>
                  </div>
                  <Switch
                    checked={form.youngerStudentIndependentLogin}
                    disabled={!isAdmin}
                    aria-label="Independent login below grade 10"
                    onCheckedChange={(checked) =>
                      setForm({ ...form, youngerStudentIndependentLogin: checked })
                    }
                  />
                </div>
                {isAdmin ? (
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={save.isPending}>
                      {save.isPending ? "Saving…" : "Save settings"}
                    </Button>
                  </div>
                ) : null}
              </form>
            )}
          </QueryState>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">Members</h2>
        <QueryState
          isPending={members.isPending}
          error={members.error}
          data={members.data}
          onRetry={() => void members.refetch()}
          isEmpty={(data) => data.length === 0}
          empty={<EmptyState title="No members yet" description="Invited people appear here." />}
        >
          {(rows) => (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={row.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium">{row.profile?.full_name ?? "Member"}</p>
                        <p className="text-sm text-muted-foreground">
                          {ROLE_LABELS[row.role?.code as RoleCode] ?? row.role?.name ?? "Member"} ·
                          joined {formatDate(row.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={row.status === "active" ? "default" : "secondary"}>
                          {row.status}
                        </Badge>
                        {isAdmin ? (
                          <Select
                            value={row.status}
                            onValueChange={(value) =>
                              changeStatus.mutate({
                                userRoleId: row.id,
                                status: value as (typeof MEMBER_STATUSES)[number],
                              })
                            }
                          >
                            <SelectTrigger className="w-36" aria-label="Member status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MEMBER_STATUSES.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </section>
    </div>
  );
}
