import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  securityChecklist,
  summarizeChecklist,
  type ChecklistStatus,
} from "@/features/security/checklist";

const statusMeta: Record<
  ChecklistStatus,
  { label: string; icon: typeof CheckCircle2; variant: "default" | "destructive" | "secondary" }
> = {
  compliant: { label: "Compliant", icon: CheckCircle2, variant: "default" },
  attention: { label: "Needs attention", icon: AlertTriangle, variant: "destructive" },
  manual: { label: "Verify manually", icon: CircleHelp, variant: "secondary" },
};

export const Route = createFileRoute("/_authenticated/account/security-checklist")({
  head: () => ({
    meta: [
      { title: "Security checklist — the Platform" },
      {
        name: "description",
        content:
          "Review which authentication and password settings are compliant and what still needs attention.",
      },
      { property: "og:title", content: "Security checklist — the Platform" },
      {
        property: "og:description",
        content:
          "Review which authentication and password settings are compliant and what still needs attention.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SecurityChecklistPage,
});

function SecurityChecklistPage() {
  const summary = summarizeChecklist();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Security checklist"
        description="Authentication settings that are already enforced, and the ones that still need a human."
        actions={
          <Button asChild variant="outline">
            <Link to="/account/security">Password &amp; security</Link>
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            {summary.compliant} of {summary.total} checks compliant
          </CardTitle>
          <CardDescription>
            {summary.attention} need attention · {summary.manual} to verify manually
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={summary.score} aria-label="Security compliance score" />
        </CardContent>
      </Card>

      <ul className="space-y-4">
        {securityChecklist.map((item) => {
          const meta = statusMeta[item.status];
          const Icon = meta.icon;
          return (
            <li key={item.id}>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon aria-hidden="true" className="size-4" />
                      {item.title}
                    </CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </div>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{item.detail}</p>
                  {item.steps ? (
                    <ol className="list-decimal space-y-1 pl-5">
                      {item.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  ) : null}
                  {item.link ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={item.link.href} target="_blank" rel="noreferrer">
                        {item.link.label}
                        <ExternalLink aria-hidden="true" className="ml-2 size-3.5" />
                      </a>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
