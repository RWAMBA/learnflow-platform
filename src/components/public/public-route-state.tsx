import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PublicLayout, PublicPageHeader } from "./public-layout";
import { SectionError } from "./cms-blocks";

export function PublicRouteError() {
  return (
    <PublicLayout>
      <PublicPageHeader title="This page could not be loaded" />
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <SectionError message="Please try again shortly. Navigation and account access remain available." />
      </div>
    </PublicLayout>
  );
}

export function PublicRouteNotFound() {
  return (
    <PublicLayout>
      <PublicPageHeader title="Page not found" />
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <p className="text-muted-foreground">
          This page may have moved, been unpublished, or the address may be incorrect.
        </p>
        <Button asChild className="mt-6 min-h-11">
          <Link to="/">Return home</Link>
        </Button>
      </div>
    </PublicLayout>
  );
}
