"use client";

import type { ChatMessage as Msg } from "@/lib/types";
import { safeHttpUrl } from "@/lib/urls";
import { SimpleMarkdown } from "./SimpleMarkdown";

export function ChatMessageView({ message }: { message: Msg }) {
  const isUser = message.role === "user";

  return (
    <article
      className="animate-rise"
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: isUser ? "min(92%, 34rem)" : "min(100%, 42rem)",
        width: isUser ? "auto" : "100%",
      }}
    >
      <div
        style={{
          padding: isUser ? "0.85rem 1.05rem" : "0",
          borderRadius: isUser ? "18px 18px 6px 18px" : 0,
          background: isUser
            ? "linear-gradient(145deg, var(--pine) 0%, var(--pine-deep) 100%)"
            : "transparent",
          color: isUser ? "#f4faf7" : "var(--ink)",
          boxShadow: isUser ? "0 10px 28px rgba(20, 61, 49, 0.22)" : "none",
        }}
      >
        {!isUser && message.demo && (
          <p
            style={{
              margin: "0 0 0.65rem",
              fontSize: "0.75rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-soft)",
              opacity: 0.75,
            }}
          >
            Demo mode sample
          </p>
        )}
        {!isUser && message.rewrittenQuery && (
          <p
            style={{
              margin: "0 0 0.75rem",
              fontSize: "0.82rem",
              color: "var(--ink-soft)",
              lineHeight: 1.45,
            }}
          >
            Searched as: <em>{message.rewrittenQuery}</em>
          </p>
        )}
        <div
          style={{
            whiteSpace: "pre-wrap",
            lineHeight: 1.55,
            fontSize: isUser ? "0.98rem" : "1.02rem",
          }}
        >
          {isUser ? message.content : <SimpleMarkdown text={message.content} />}
        </div>
        {!isUser && message.disclaimer && (
          <p
            style={{
              margin: "1rem 0 0",
              padding: "0.75rem 0 0",
              borderTop: "1px solid var(--line)",
              fontSize: "0.86rem",
              color: "var(--ink-soft)",
              lineHeight: 1.45,
            }}
          >
            {message.disclaimer}
          </p>
        )}
        {!isUser && message.citations && message.citations.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              margin: "1rem 0 0",
              padding: "0.85rem 0 0",
              borderTop: "1px solid var(--line)",
              display: "grid",
              gap: "0.55rem",
            }}
          >
            {message.citations.map((c, i) => {
              const href = safeHttpUrl(c.url);
              if (!href) {
                return (
                  <li key={c.url + i} style={{ fontSize: "0.9rem", lineHeight: 1.4 }}>
                    [{i + 1}] {c.title}
                  </li>
                );
              }
              return (
              <li key={href + i} style={{ fontSize: "0.9rem", lineHeight: 1.4 }}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--pine)",
                    fontWeight: 600,
                    textDecoration: "underline",
                    textUnderlineOffset: "3px",
                  }}
                >
                  [{i + 1}] {c.title}
                </a>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}
