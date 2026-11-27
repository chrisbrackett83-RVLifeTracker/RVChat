"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChatMessageView } from "./ChatMessage";
import type { ChatApiResponse, ChatMessage, ProviderStatus } from "@/lib/types";

const SUGGESTIONS = [
  "suburban furnace diagram",
  "lippert slide won’t retract",
  "shore power 30A vs 50A dogbone",
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/status", { credentials: "same-origin" })
      .then(async (r) => {
        const raw = await r.text();
        try {
          return JSON.parse(raw) as ProviderStatus;
        } catch {
          throw new Error(`status ${r.status}`);
        }
      })
      .then((s: ProviderStatus) => setStatus(s))
      .catch(() =>
        setStatus({
          demoMode: true,
          llm: "none",
          search: "none",
          missing: ["Unable to reach status — refresh while signed into Cursor"],
        }),
      );
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    setHeroCollapsed(true);
    setError(null);
    setBusy(true);
    setInput("");

    const userMsg: ChatMessage = { id: uid(), role: "user", content: q };
    setMessages((m) => [...m, userMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });

      const raw = await res.text();
      let data: ChatApiResponse | null = null;
      try {
        data = JSON.parse(raw) as ChatApiResponse;
      } catch {
        const msg =
          res.status === 401 || /sign.?in/i.test(raw)
            ? "Sign in to Cursor to use My RV Assistant."
            : res.status === 502 || res.status === 504
              ? "The chat service timed out or was overloaded. Wait a moment and try again."
              : `Chat API returned an unexpected response (${res.status}). Refresh and try again.`;
        setError(msg);
        setMessages((m) => [
          ...m,
          { id: uid(), role: "assistant", content: msg, demo: true },
        ]);
        return;
      }

      if (data.status) setStatus(data.status);

      if (!data.ok) {
        const errText =
          data.error ||
          (res.status === 401
            ? "Sign in to Cursor to use My RV Assistant."
            : `Request failed (${res.status}).`);
        setError(errText);
        setMessages((m) => [
          ...m,
          {
            id: uid(),
            role: "assistant",
            content: errText,
            demo: data.status?.demoMode,
          },
        ]);
        return;
      }

      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          content: data.answer,
          citations: data.citations,
          rewrittenQuery: data.rewrittenQuery,
          demo: data.demo,
          disclaimer: data.disclaimer || undefined,
        },
      ]);
    } catch {
      const msg =
        "Could not reach the chat API. Refresh this page while signed into Cursor and try again.";
      setError(msg);
      setMessages((m) => [
        ...m,
        { id: uid(), role: "assistant", content: msg, demo: true },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        className="glow-orb"
        style={{
          position: "absolute",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(59,130,246,0.18), transparent 68%)",
          top: "-12%",
          right: "-8%",
          filter: "blur(6px)",
          pointerEvents: "none",
        }}
      />

      <main
        style={{
          width: "min(920px, 100%)",
          margin: "0 auto",
          padding: heroCollapsed
            ? "1.25rem 1.25rem 1.5rem"
            : "clamp(2rem, 8vh, 4.5rem) 1.25rem 1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: heroCollapsed ? "1rem" : "1.35rem",
          position: "relative",
          zIndex: 1,
          flex: 1,
          minHeight: 0,
        }}
      >
        <header
          className="animate-rise"
          style={{
            textAlign: "center",
            transition: "margin 0.35s ease, transform 0.35s ease",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: heroCollapsed
                ? "clamp(1.35rem, 3.5vw, 1.75rem)"
                : "clamp(2rem, 6vw, 2.75rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
              color: "var(--brand-900)",
              transition: "font-size 0.35s ease",
            }}
          >
            My RV Assistant
          </p>
          {!heroCollapsed && (
            <p
              className="animate-rise-delay"
              style={{
                margin: "0.85rem auto 0",
                maxWidth: "28rem",
                fontSize: "1.05rem",
                lineHeight: 1.55,
                color: "var(--ink-soft)",
              }}
            >
              Ask anything—every answer stays in RV and camping context, with
              sources you can open.
            </p>
          )}
        </header>

        <div className="animate-rise-delay">
          <form
            onSubmit={onSubmit}
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "0.65rem",
              alignItems: "end",
              padding: "0.75rem",
              borderRadius: 16,
              background: "#fff",
              border: "1px solid #e5e7eb",
              boxShadow: "var(--shadow)",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              rows={2}
              placeholder="Ask about furnaces, slides, shore power, boondocking…"
              disabled={busy}
              aria-label="Your RV question"
              style={{
                resize: "none",
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "inherit",
                fontSize: "1rem",
                lineHeight: 1.45,
                color: "var(--ink)",
                padding: "0.45rem 0.55rem",
              }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              style={{
                border: "none",
                borderRadius: 12,
                padding: "0.85rem 1.15rem",
                background: busy ? "#93c5fd" : "var(--brand-600)",
                color: "#fff",
                fontFamily: "inherit",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor: busy || !input.trim() ? "not-allowed" : "pointer",
                opacity: !input.trim() ? 0.55 : 1,
              }}
            >
              Ask
            </button>
          </form>
          {error && (
            <p
              role="alert"
              style={{
                margin: "0.55rem 0 0",
                fontSize: "0.85rem",
                color: "var(--accent-hot)",
              }}
            >
              {error}
            </p>
          )}
        </div>

        {status?.demoMode && (
          <p
            className="animate-rise-delay"
            style={{
              margin: 0,
              textAlign: "center",
              fontSize: "0.86rem",
              color: "var(--ink-soft)",
            }}
          >
            Running in{" "}
            <strong style={{ color: "var(--brand-700)", fontWeight: 650 }}>
              demo mode
            </strong>
            {status.missing.length > 0
              ? ` — add API keys to .env.local for live search + answers.`
              : "."}
          </p>
        )}

        <section
          ref={listRef}
          aria-live="polite"
          style={{
            flex: 1,
            minHeight: heroCollapsed ? "40vh" : "12vh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1.15rem",
            paddingBottom: "0.5rem",
          }}
        >
          {messages.length === 0 && !heroCollapsed && (
            <div
              className="animate-rise-late"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.55rem",
                justifyContent: "center",
                marginTop: "0.25rem",
              }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  style={{
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    color: "var(--ink-soft)",
                    borderRadius: 999,
                    padding: "0.55rem 0.95rem",
                    fontFamily: "inherit",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgb(0 0 0 / 0.05)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {messages.map((m) => (
            <ChatMessageView key={m.id} message={m} />
          ))}

          {busy && (
            <p
              style={{
                margin: 0,
                color: "var(--ink-soft)",
                fontSize: "0.92rem",
              }}
            >
              Searching RV sources…
            </p>
          )}
        </section>

        <p
          style={{
            margin: "0.25rem 0 0",
            fontSize: "0.75rem",
            color: "var(--ink-soft)",
            textAlign: "center",
            opacity: 0.85,
          }}
        >
          Personal MVP for Chris Brackett · not affiliated with RVLifeTracker ·
          electrical / propane / brake tips need a pro
        </p>
      </main>
    </div>
  );
}
