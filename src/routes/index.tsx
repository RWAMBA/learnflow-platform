import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Platform — Homeschooling & Alternative Education" },
      {
        name: "description",
        content:
          "A multi-tenant platform for homeschooling and alternative education: curriculum, assignments, progress and family messaging in one place.",
      },
      { property: "og:title", content: "Platform — Homeschooling & Alternative Education" },
      {
        property: "og:description",
        content:
          "Curriculum browsing, assignments, mastery tracking and secure messaging for families, teachers and tutors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const HIGHLIGHTS = [
  {
    icon: BookOpen,
    title: "Curriculum spine",
    body: "Browse grades, pathways, subjects and lessons built on the Kenya CBC structure.",
  },
  {
    icon: Users,
    title: "Roles that fit real families",
    body: "One account can be a parent and a tutor at once, each scoped to an organization.",
  },
  {
    icon: ShieldCheck,
    title: "Relationship-based access",
    body: "Every read and write is enforced in the database, not in the interface.",
  },
];

function HomePage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <span className="font-semibold">the Platform</span>
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Homeschooling and alternative education, organised.
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Students, parents and guardians, teachers, tutors and administrators share one workspace —
          with assignments, progress and messaging scoped to the relationships that actually exist.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth" search={{ mode: "sign-up" as const }}>
              Create an account
            </Link>
          </Button>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HIGHLIGHTS.map((item) => (
            <Card key={item.title}>
              <CardHeader className="pb-2">
                <item.icon aria-hidden="true" className="size-6 text-primary" />
                <CardTitle className="text-lg">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.body}</CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
