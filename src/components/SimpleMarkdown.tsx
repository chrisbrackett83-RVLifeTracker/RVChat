"use client";

import type { ReactNode } from "react";
import type { Citation } from "@/lib/types";
import { safeHttpUrl } from "@/lib/urls";

/** Minimal inline markdown: **bold**, _italic_, and clickable [n] citation markers. */
export function SimpleMarkdown({
  text,
  citations,
}: {
  text: string;
  citations?: Citation[];
}) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 && "\n"}
          {renderInline(line, citations)}
        </span>
      ))}
    </>
  );
}

function renderInline(line: string, citations?: Citation[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\[[0-9]+\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) nodes.push(line.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`b${i++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("_") && token.endsWith("_")) {
      nodes.push(<em key={`e${i++}`}>{token.slice(1, -1)}</em>);
    } else {
      const n = Number(token.slice(1, -1));
      const cite = citations?.[n - 1];
      const href = cite ? safeHttpUrl(cite.url) : null;
      if (href) {
        nodes.push(
          <a
            key={`c${i++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={cite?.title || `Source ${n}`}
            style={{
              fontWeight: 700,
              color: "var(--brand-700)",
              textDecoration: "none",
              padding: "0 0.12em",
              borderRadius: "0.3em",
              background: "var(--brand-100)",
            }}
          >
            {token}
          </a>,
        );
      } else {
        nodes.push(
          <span
            key={`c${i++}`}
            style={{ fontWeight: 650, color: "var(--pine)" }}
          >
            {token}
          </span>,
        );
      }
    }
    last = m.index + token.length;
  }
  if (last < line.length) nodes.push(line.slice(last));
  return nodes;
}
