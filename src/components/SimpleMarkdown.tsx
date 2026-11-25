"use client";

import type { ReactNode } from "react";

/** Minimal inline markdown: **bold**, _italic_, and [n] citation markers. */
export function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 && "\n"}
          {renderInline(line)}
        </span>
      ))}
    </>
  );
}

function renderInline(line: string): ReactNode[] {
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
      nodes.push(
        <span key={`c${i++}`} style={{ fontWeight: 650, color: "var(--pine)" }}>
          {token}
        </span>,
      );
    }
    last = m.index + token.length;
  }
  if (last < line.length) nodes.push(line.slice(last));
  return nodes;
}
