import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryState } from "@/components/shared/query-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminKeys, listAuditLogs, listSecurityEvents, listTenants } from "@/features/admin/api";
import { useRoleContext } from "@/features/roles/role-context";
import { formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/tenants")({
  head: () => ({
    meta: [
      { title: "Platform administration — the Platform" },
      { name: "description", content: "Tenants, plans and platform-wide activity." },
      { property: "og:title", content: "Platform administration — the Platform" },
      { property: "og:description", content: "Tenants, plans and platform-wide activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { viewer } = useRoleContext();
  const [term, setTerm] = useState("");

  const tenants = useQuery({
    queryKey: adminKeys.tenants(),
    queryFn: listTenants,
    enabled: viewer.isPlatformAdmin,
  });
  const auditLogs = useQuery({
    queryKey: adminKeys.auditLogs(null),
    queryFn: () => listAuditLogs(null),
    enabled: viewer.isPlatformAdmin,
  });
  const securityEvents = useQuery({
    queryKey: adminKeys.securityEvents(),
    queryFn: listSecurityEvents,
    enabled: viewer.isPlatformAdmin,
  });

  if (!viewer.isPlatformAdmin) {
    return (
      <div>
        <PageHeader
          title="Platform administration"
          description="Tenants, plans and platform-wide activity."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Restricted area"
          description="Only platform administrators can view tenants and platform activity."
        />
      </div>
    );
  }

  const needle = term.trim().toLowerCase();
  const filteredTenants = (tenants.data ?? []).filter((row) =>
    needle ? row.name.toLowerCase().includes(needle) : true,
  );

  return (
    <div>
      <PageHeader
        title="Platform administration"
        description="Tenants, plans and platform-wide activity."
      />

      <Tabs defaultValue="tenants">
        <TabsList className="mb-4">
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="security">Security events</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="space-y-4">
          <Input
            aria-label="Search tenants"
            placeholder="Search organizations"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className="sm:max-w-xs"
          />
          <QueryState
            isPending={tenants.isPending}
            error={tenants.error}
            data={filteredTenants}
            onRetry={() => void tenants.refetch()}
            isEmpty={(data) => data.length === 0}
            empty={<EmptyState title="No tenants" description="No organizations match." />}
          >
            {(rows) => (
              <ul className="space-y-3">
                {rows.map((row) => {
                  const subscription = Array.isArray(row.subscription)
                    ? row.subscription[0]
                    : row.subscription;
                  return (
                    <li key={row.id}>
                      <Card>
                        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                          <div>
                            <p className="font-medium">{row.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {row.tenant_type.replace(/_/g, " ")} · {row.default_currency} ·{" "}
                              {row.timezone} · created {formatDate(row.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {subscription?.plan?.name ?? "No plan"}
                            </Badge>
                            {subscription?.status ? <Badge>{subscription.status}</Badge> : null}
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
        </TabsContent>

        <TabsContent value="audit">
          <QueryState
            isPending={auditLogs.isPending}
            error={auditLogs.error}
            data={auditLogs.data}
            onRetry={() => void auditLogs.refetch()}
            isEmpty={(data) => data.length === 0}
            empty={
              <EmptyState title="No activity yet" description="Audited actions appear here." />
            }
          >
            {(rows) => (
              <ul className="space-y-2">
                {rows.map((row) => (
                  <li key={row.id} className="rounded-md border p-3">
                    <p className="font-medium">{row.action}</p>
                    <p className="text-sm text-muted-foreground">
                      {row.entity_type} · {row.entity_id ?? "—"} · {formatDateTime(row.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </TabsContent>

        <TabsContent value="security">
          <QueryState
            isPending={securityEvents.isPending}
            error={securityEvents.error}
            data={securityEvents.data}
            onRetry={() => void securityEvents.refetch()}
            isEmpty={(data) => data.length === 0}
            empty={<EmptyState title="No security events" description="Nothing needs attention." />}
          >
            {(rows) => (
              <ul className="space-y-2">
                {rows.map((row) => (
                  <li key={row.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{row.event_type}</p>
                      <Badge variant={row.severity === "critical" ? "destructive" : "secondary"}>
                        {row.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(row.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </TabsContent>
      </Tabs>
    </div>
  );
}
