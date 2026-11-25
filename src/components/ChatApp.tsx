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
            ? "Sign in to Cursor to use RV Chat."
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
            ? "Sign in to Cursor to use RV Chat."
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
        display: "grid",
        gridTemplateRows: "1fr auto",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Atmospheric layers */}
      <div
        aria-hidden
        className="glow-orb"
        style={{
          position: "absolute",
          width: 420,
          height: 420,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(110,168,192,0.55), transparent 70%)",
          top: "-8%",
          left: "-6%",
          filter: "blur(8px)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        className="trail-band"
        style={{
          position: "absolute",
          inset: "auto 0 18% 0",
          height: 120,
          background:
            "linear-gradient(90deg, transparent, rgba(31,92,72,0.08), transparent)",
          pointerEvents: "none",
        }}
      />

      <main
        style={{
          width: "min(920px, 100%)",
          margin: "0 auto",
          padding: heroCollapsed
            ? "1.25rem 1.25rem 0"
            : "clamp(2rem, 8vh, 4.5rem) 1.25rem 0",
          display: "flex",
          flexDirection: "column",
          gap: heroCollapsed ? "1rem" : "1.75rem",
          position: "relative",
          zIndex: 1,
          minHeight: 0,
        }}
      >
        {/* Brand-first hero composition */}
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
              fontFamily: "var(--font-display)",
              fontSize: heroCollapsed
                ? "clamp(1.6rem, 4vw, 2rem)"
                : "clamp(3.2rem, 10vw, 5.4rem)",
              fontWeight: 600,
              letterSpacing: "-0.03em",
              lineHeight: 0.95,
              color: "var(--pine-deep)",
              transition: "font-size 0.35s ease",
            }}
          >
            RV Chat
          </p>
          {!heroCollapsed && (
            <>
              <p
                className="animate-rise-delay"
                style={{
                  margin: "1.1rem auto 0",
                  maxWidth: "28rem",
                  fontSize: "1.08rem",
                  lineHeight: 1.5,
                  color: "var(--ink-soft)",
                }}
              >
                Ask anything—every answer stays in RV and camping context, with
                sources you can open.
              </p>
              <div
                aria-hidden
                className="animate-rise-late"
                style={{
                  margin: "1.75rem auto 0",
                  width: "min(100%, 520px)",
                  height: "clamp(140px, 22vh, 220px)",
                  borderRadius: 24,
                  background:
                    "linear-gradient(160deg, rgba(110,168,192,0.55) 0%, rgba(31,92,72,0.35) 45%, rgba(20,61,49,0.55) 100%), radial-gradient(circle at 30% 40%, rgba(255,255,255,0.35), transparent 55%)",
                  boxShadow: "var(--shadow)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: "auto 8% 18% 8%",
                    height: 18,
                    borderRadius: 999,
                    background: "rgba(26,47,40,0.2)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: "18%",
                    bottom: "28%",
                    width: "42%",
                    height: 54,
                    borderRadius: "10px 14px 8px 8px",
                    background: "rgba(243,247,245,0.88)",
                    boxShadow: "0 8px 20px rgba(20,61,49,0.18)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: "16%",
                    top: "28%",
                    width: 70,
                    height: 70,
                    borderRadius: "50%",
                    background: "rgba(255,236,180,0.55)",
                    filter: "blur(2px)",
                  }}
                />
              </div>
            </>
          )}
        </header>

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
            <strong style={{ color: "var(--pine)", fontWeight: 650 }}>
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
                    border: "1px solid var(--line)",
                    background: "rgba(243,247,245,0.72)",
                    color: "var(--ink-soft)",
                    borderRadius: 999,
                    padding: "0.55rem 0.95rem",
                    fontFamily: "inherit",
                    fontSize: "0.9rem",
                    cursor: "pointer",
                    backdropFilter: "blur(6px)",
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
      </main>

      <footer
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 2,
          padding: "0.85rem 1.25rem 1.25rem",
          background:
            "linear-gradient(180deg, rgba(243,247,245,0), rgba(243,247,245,0.92) 35%, rgba(227,236,231,0.96))",
        }}
      >
        <form
          onSubmit={onSubmit}
          style={{
            width: "min(920px, 100%)",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "0.65rem",
            alignItems: "end",
            padding: "0.65rem",
            borderRadius: 22,
            background: "rgba(255,255,255,0.78)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow)",
            backdropFilter: "blur(10px)",
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
              borderRadius: 14,
              padding: "0.85rem 1.15rem",
              background: busy
                ? "var(--sage)"
                : "linear-gradient(145deg, var(--accent), var(--pine-deep))",
              color: "#f7fbf9",
              fontFamily: "inherit",
              fontWeight: 650,
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
              width: "min(920px, 100%)",
              margin: "0.55rem auto 0",
              fontSize: "0.85rem",
              color: "var(--accent-hot)",
            }}
          >
            {error}
          </p>
        )}
        <p
          style={{
            width: "min(920px, 100%)",
            margin: "0.55rem auto 0",
            fontSize: "0.75rem",
            color: "var(--ink-soft)",
            textAlign: "center",
            opacity: 0.85,
          }}
        >
          Personal MVP for Chris Brackett · not affiliated with RVLifeTracker ·
          electrical / propane / brake tips need a pro
        </p>
      </footer>
    </div>
  );
}
