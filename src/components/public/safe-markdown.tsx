/**
 * Minimal, allowlist-only Markdown renderer.
 *
 * CMS rich text is Markdown, never HTML. Nothing here parses or emits raw
 * markup: every node becomes a React element, so React's own escaping is the
 * final defence and `dangerouslySetInnerHTML` is never used. Links are limited
 * to https/mailto and external ones carry rel="noopener noreferrer nofollow".
 */
import { Fragment, type ReactNode } from "react";

const SAFE_LINK = /^(https:\/\/|mailto:|\/)/i;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: links, then code, then bold, then italic.
  const pattern = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)|`([^`\n]{1,300})`|\*\*([^*\n]{1,300})\*\*|_([^_\n]{1,300})_/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-i${index++}`;

    if (match[1] !== undefined && match[2] !== undefined) {
      const href = match[2];
      if (SAFE_LINK.test(href)) {
        const external = href.startsWith("https://");
        nodes.push(
          <a
            key={key}
            href={href}
            className="underline underline-offset-2 hover:no-underline"
            {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
          >
            {match[1]}
          </a>,
        );
      } else {
        // Unsafe protocol: keep the label, drop the link entirely.
        nodes.push(match[1]);
      }
    } else if (match[3] !== undefined) {
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {match[3]}
        </code>,
      );
    } else if (match[4] !== undefined) {
      nodes.push(<strong key={key}>{match[4]}</strong>);
    } else if (match[5] !== undefined) {
      nodes.push(<em key={key}>{match[5]}</em>);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function SafeMarkdown({ source, className }: { source: string; className?: string }) {
  if (!source?.trim()) return null;

  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = (key: string) => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={key} className="leading-relaxed">
        {renderInline(paragraph.join(" "), key)}
      </p>,
    );
    paragraph = [];
  };
  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc space-y-1 pl-6">
        {list.map((item, i) => (
          <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((line, i) => {
    const key = `b${i}`;
    const heading = /^(#{2,4})\s+(.{1,200})$/.exec(line);
    const bullet = /^[-*]\s+(.{1,500})$/.exec(line);

    if (heading) {
      flushParagraph(`${key}-p`);
      flushList(`${key}-l`);
      const level = heading[1]!.length;
      const text = heading[2]!;
      const cls =
        level === 2 ? "text-xl font-semibold" : level === 3 ? "text-lg font-semibold" : "text-base font-semibold";
      blocks.push(
        <Fragment key={key}>
          {level === 2 ? (
            <h2 className={cls}>{renderInline(text, key)}</h2>
          ) : level === 3 ? (
            <h3 className={cls}>{renderInline(text, key)}</h3>
          ) : (
            <h4 className={cls}>{renderInline(text, key)}</h4>
          )}
        </Fragment>,
      );
    } else if (bullet) {
      flushParagraph(`${key}-p`);
      list.push(bullet[1]!);
    } else if (line.trim() === "") {
      flushParagraph(`${key}-p`);
      flushList(`${key}-l`);
    } else {
      flushList(`${key}-l`);
      paragraph.push(line.trim());
    }
  });
  flushParagraph("tail-p");
  flushList("tail-l");

  return <div className={className ?? "space-y-4 text-base"}>{blocks}</div>;
}
