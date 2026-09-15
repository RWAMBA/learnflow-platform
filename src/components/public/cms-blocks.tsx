/**
 * Renders published CMS blocks with the full set of mandatory UX states.
 *
 * An empty production state is a legitimate, truthful outcome — it says the
 * section has not been published yet rather than pretending content exists or
 * spinning forever. When a read fails the page still renders; only this
 * section degrades.
 */
import { AlertTriangle, FileText } from "lucide-react";
import type { PublicContentBlock } from "@/lib/public-content.functions";
import { SafeMarkdown } from "./safe-markdown";

export function StaleNotice({ fetchedAt }: { fetchedAt: string | null }) {
  if (!fetchedAt) return null;
  return (
    <p className="mt-8 text-xs text-muted-foreground">
      Content loaded {new Date(fetchedAt).toLocaleString()}.
    </p>
  );
}

export function SectionError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium">This section could not be loaded</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {message ?? "The rest of the page still works. Please try again shortly."}
        </p>
      </div>
    </div>
  );
}

export function SectionEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <FileText className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function CmsBlocks({
  blocks,
  fetchedAt,
  failed = false,
  emptyTitle = "Nothing published here yet",
  emptyDescription = "This section will appear as soon as it has been published.",
}: {
  blocks: PublicContentBlock[];
  fetchedAt: string | null;
  failed?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      {failed ? (
        <SectionError />
      ) : blocks.length === 0 ? (
        <SectionEmpty title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="space-y-12">
          {blocks.map((block) => (
            <section key={block.id} aria-labelledby={`block-${block.id}`}>
              <h2 id={`block-${block.id}`} className="text-2xl font-semibold tracking-tight">
                {block.title}
              </h2>
              {block.summary ? (
                <p className="mt-2 text-base text-muted-foreground">{block.summary}</p>
              ) : null}
              <SafeMarkdown source={block.bodyMarkdown} className="mt-4 space-y-4 text-base" />
            </section>
          ))}
        </div>
      )}
      <StaleNotice fetchedAt={failed ? null : fetchedAt} />
    </div>
  );
}
