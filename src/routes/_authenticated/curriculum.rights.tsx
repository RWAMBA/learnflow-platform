import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Plus, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton, QueryState } from "@/components/shared/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RightsGrantDialog,
  SourceArtifactDialog,
  VersionGovernanceDialog,
} from "@/features/curriculum/components/rights-dialogs";
import {
  getCbcScopeReport,
  humanLabel,
  listCurriculumCatalogue,
  listRightsAudit,
  listRightsGrants,
  listSourceArtifacts,
  rightsKeys,
} from "@/features/curriculum/rights-api";
import { canAuthorPlatformCurriculum } from "@/features/roles/permissions";
import { useRoleContext } from "@/features/roles/role-context";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/curriculum/rights")({
  head: () => ({
    meta: [
      { title: "Curriculum rights and availability — LearnFlow" },
      {
        name: "description",
        content:
          "Source provenance, licence grants, traceability and the curriculum availability matrix.",
      },
      { property: "og:title", content: "Curriculum rights and availability — LearnFlow" },
      {
        property: "og:description",
        content: "Record curriculum sources, review licence grants and control what learners see.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CurriculumRightsPage,
});

function CurriculumRightsPage() {
  const { viewer } = useRoleContext();
  const mayGovern = canAuthorPlatformCurriculum(viewer.isPlatformAdmin);
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");

  const catalogue = useQuery({
    queryKey: rightsKeys.catalogue(),
    queryFn: listCurriculumCatalogue,
  });
  const scope = useQuery({ queryKey: ["rights", "cbc-scope"], queryFn: getCbcScopeReport });
  const sources = useQuery({
    queryKey: rightsKeys.sources(term),
    queryFn: () => listSourceArtifacts(term),
    enabled: mayGovern,
  });
  const grants = useQuery({
    queryKey: rightsKeys.grants(null),
    queryFn: () => listRightsGrants(null),
    enabled: mayGovern,
  });
  const audit = useQuery({
    queryKey: rightsKeys.audit(null),
    queryFn: () => listRightsAudit(null),
    enabled: mayGovern,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["rights"] });

  if (!mayGovern) {
    return (
      <div>
        <PageHeader
          title="Curriculum availability"
          description="Which curricula are currently offered on LearnFlow."
        />
        <QueryState
          isPending={catalogue.isPending}
          error={catalogue.error}
          data={catalogue.data}
          onRetry={() => void catalogue.refetch()}
          skeleton={<ListSkeleton rows={3} />}
        >
          {(rows) => (
            <ul className="divide-y rounded-md border">
              {rows.map((entry) => (
                <li
                  key={entry.curriculumId}
                  className="flex flex-wrap items-center justify-between gap-2 p-3"
                >
                  <div>
                    <p className="font-medium">{entry.curriculumName}</p>
                    <p className="text-sm text-muted-foreground">
                      {entry.providerName ?? "LearnFlow"}
                    </p>
                  </div>
                  <Badge variant={entry.availableToUsers ? "default" : "secondary"}>
                    {entry.availableToUsers ? "Available" : "Coming soon"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Curriculum rights and availability"
        description="Provenance, licence grants and the activation gate that decides what learners can be offered."
        actions={
          <SourceArtifactDialog
            onSaved={refresh}
            trigger={
              <Button>
                <Plus aria-hidden="true" className="size-4" /> Record source
              </Button>
            }
          />
        }
      />

      <Tabs defaultValue="availability">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="grants">Grants</TabsTrigger>
          <TabsTrigger value="scope">CBC scope</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="availability">
          <QueryState
            isPending={catalogue.isPending}
            error={catalogue.error}
            data={catalogue.data}
            onRetry={() => void catalogue.refetch()}
            skeleton={<ListSkeleton rows={4} />}
            isEmpty={(rows) => rows.length === 0}
            empty={
              <EmptyState
                title="No curricula configured"
                description="Add a curriculum framework first."
              />
            }
          >
            {(rows) => (
              <div className="grid gap-3 md:grid-cols-2">
                {rows.map((entry) => (
                  <Card key={entry.curriculumId}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">{entry.curriculumName}</CardTitle>
                          <CardDescription>
                            {entry.providerName ?? "LearnFlow"} · {entry.curriculumCode}
                          </CardDescription>
                        </div>
                        <Badge variant={entry.availableToUsers ? "default" : "secondary"}>
                          {entry.availableToUsers ? "Active" : "Not offered"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground">{entry.internalStatus}</p>
                      {entry.currentVersion ? (
                        <>
                          <dl className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <dt className="text-muted-foreground">Content</dt>
                              <dd>{humanLabel(entry.currentVersion.content_readiness)}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Rights</dt>
                              <dd>{humanLabel(entry.currentVersion.rights_status)}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Activation</dt>
                              <dd>{humanLabel(entry.currentVersion.activation_status)}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Reviewed</dt>
                              <dd>
                                {entry.currentVersion.rights_reviewed_at
                                  ? formatDateTime(entry.currentVersion.rights_reviewed_at)
                                  : "Not reviewed"}
                              </dd>
                            </div>
                          </dl>
                          <VersionGovernanceDialog
                            version={entry.currentVersion}
                            onSaved={refresh}
                            trigger={
                              <Button variant="outline" size="sm">
                                <ShieldCheck aria-hidden="true" className="size-4" /> Review
                                availability
                              </Button>
                            }
                          />
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No version defined for this curriculum yet.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </QueryState>
        </TabsContent>

        <TabsContent value="sources">
          <div className="mb-4 max-w-sm">
            <Label htmlFor="source-search">Search sources</Label>
            <Input
              id="source-search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search by title"
            />
          </div>
          <QueryState
            isPending={sources.isPending}
            error={sources.error}
            data={sources.data}
            onRetry={() => void sources.refetch()}
            skeleton={<ListSkeleton rows={3} />}
            isEmpty={(rows) => rows.length === 0}
            empty={
              <EmptyState
                title="No sources recorded"
                description="Record where curriculum material came from before importing anything."
              />
            }
          >
            {(rows) => (
              <ul className="divide-y rounded-md border">
                {rows.map((source) => (
                  <li
                    key={source.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{source.source_title}</p>
                      <p className="text-sm text-muted-foreground">
                        {source.rights_holder} · {humanLabel(source.source_type)}
                        {source.jurisdiction ? ` · ${source.jurisdiction}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{humanLabel(source.verification_status)}</Badge>
                      <RightsGrantDialog
                        sourceArtifactId={source.id}
                        onSaved={refresh}
                        trigger={
                          <Button variant="outline" size="sm">
                            Add grant
                          </Button>
                        }
                      />
                      <SourceArtifactDialog
                        artifact={source}
                        onSaved={refresh}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </TabsContent>

        <TabsContent value="grants">
          <QueryState
            isPending={grants.isPending}
            error={grants.error}
            data={grants.data}
            onRetry={() => void grants.refetch()}
            skeleton={<ListSkeleton rows={3} />}
            isEmpty={(rows) => rows.length === 0}
            empty={
              <EmptyState
                title="No rights grants"
                description="A curriculum can only be authorized once a reviewed, in-date grant exists."
              />
            }
          >
            {(rows) => (
              <ul className="divide-y rounded-md border">
                {rows.map((grant) => (
                  <li key={grant.id} className="space-y-1 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{humanLabel(grant.grant_type)}</p>
                      <Badge variant={grant.reviewed_at ? "default" : "secondary"}>
                        {grant.reviewed_at ? "Reviewed" : "Awaiting review"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {grant.grant_reference ?? "No reference"} ·{" "}
                      {grant.effective_date ?? "no start"} → {grant.expiry_date ?? "no expiry"}
                      {grant.territory ? ` · ${grant.territory}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Permits: {grant.permits_storage ? "storage" : "no storage"},{" "}
                      {grant.permits_commercial_use ? "commercial use" : "non-commercial"},{" "}
                      {grant.permits_authenticated_display
                        ? "signed-in display"
                        : "no signed-in display"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </TabsContent>

        <TabsContent value="scope">
          <QueryState
            isPending={scope.isPending}
            error={scope.error}
            data={scope.data}
            onRetry={() => void scope.refetch()}
            skeleton={<ListSkeleton rows={2} />}
          >
            {(report) => (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {report.compliant ? (
                      <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
                    ) : (
                      <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
                    )}
                    CBC scope — Grades 1 to 12
                  </CardTitle>
                  <CardDescription>
                    Primary 1–6, Junior Secondary 7–9, Senior Secondary 10–12. Pre-Primary is out of
                    scope.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>
                    {report.present.length} of {report.expected} academic levels present.
                  </p>
                  {report.missing.length > 0 ? (
                    <p className="text-destructive">Missing grades: {report.missing.join(", ")}</p>
                  ) : null}
                  {report.duplicated.length > 0 ? (
                    <p className="text-destructive">
                      Duplicated sequence positions: {report.duplicated.join(", ")}
                    </p>
                  ) : null}
                  {report.outOfScope.length > 0 ? (
                    <p className="text-destructive">
                      Out-of-scope levels: {report.outOfScope.map((row) => row.name).join(", ")}
                    </p>
                  ) : null}
                  {report.unavailableStages.length > 0 ? (
                    <div>
                      <p className="font-medium">Stages flagged unavailable</p>
                      <ul className="list-inside list-disc text-muted-foreground">
                        {report.unavailableStages.map((stage) => (
                          <li key={stage.id}>
                            {stage.name}
                            {stage.reason ? ` — ${stage.reason}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </QueryState>
        </TabsContent>

        <TabsContent value="audit">
          <QueryState
            isPending={audit.isPending}
            error={audit.error}
            data={audit.data}
            onRetry={() => void audit.refetch()}
            skeleton={<ListSkeleton rows={3} />}
            isEmpty={(rows) => rows.length === 0}
            empty={
              <EmptyState
                title="No rights activity yet"
                description="Every grant change is recorded here and cannot be edited or deleted."
              />
            }
          >
            {(rows) => (
              <ul className="divide-y rounded-md border">
                {rows.map((entry) => (
                  <li key={entry.id} className="p-3 text-sm">
                    <p className="font-medium">
                      {entry.action} · {entry.entity_type}
                    </p>
                    <p className="text-muted-foreground">{formatDateTime(entry.created_at)}</p>
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
