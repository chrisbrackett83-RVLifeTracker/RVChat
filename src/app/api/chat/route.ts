import { NextResponse } from "next/server";
import { requireIdentity } from "../../../../cursor/identity";
import { getProviderStatus, getSearchLimit } from "@/lib/config";
import { demoAnswer } from "@/lib/demo";
import {
  needsSafetyDisclaimer,
  SAFETY_DISCLAIMER,
  softGuardrailNote,
} from "@/lib/guardrails";
import { generateAnswer } from "@/lib/llm";
import { rankAndCap } from "@/lib/rank";
import { takeRateLimit } from "@/lib/rateLimit";
import { rewriteQueryWithHistory } from "@/lib/rewrite";
import { webSearch } from "@/lib/search";
import type { ChatApiResponse, ChatHistoryTurn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CONTENT = 1500;

function jsonOk(body: ChatApiResponse, status = 200) {
  // Prefer HTTP 200 for app-level failures so the host doesn't replace the
  // body with an HTML gateway error page (which the UI can't parse).
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

function sanitizeHistory(raw: unknown): ChatHistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatHistoryTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: string }).role;
    const content = (item as { content?: string }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim().slice(0, MAX_HISTORY_CONTENT);
    if (!trimmed) continue;
    out.push({ role, content: trimmed });
    if (out.length >= MAX_HISTORY_TURNS) break;
  }
  return out;
}

export async function POST(req: Request) {
  const status = getProviderStatus();

  try {
    const identity = await requireIdentity(req);
    if (identity instanceof Response) {
      return jsonOk(
        {
          ok: false,
          error: "Sign in to Cursor to use My RV Assistant.",
          status,
        },
        401,
      );
    }

    const limited = takeRateLimit(`chat:${identity.sub}`, 20, 60_000);
    if (!limited.ok) {
      return jsonOk({
        ok: false,
        error: `Too many questions — try again in about ${limited.retryAfterSec}s.`,
        status,
      });
    }

    let body: { message?: string; history?: unknown };
    try {
      body = (await req.json()) as { message?: string; history?: unknown };
    } catch {
      return jsonOk(
        {
          ok: false,
          error: "Send a JSON body with a message string.",
          status,
        },
        400,
      );
    }

    const message = (body.message || "").trim();
    if (!message) {
      return jsonOk(
        { ok: false, error: "Please enter a question.", status },
        400,
      );
    }

    if (message.length > 2000) {
      return jsonOk(
        {
          ok: false,
          error: "Please keep questions under 2000 characters.",
          status,
        },
        400,
      );
    }

    const history = sanitizeHistory(body.history);
    const rewrittenQuery = rewriteQueryWithHistory(message, history);

    const guard = softGuardrailNote(message);
    if (guard) {
      return jsonOk({
        ok: true,
        answer: guard,
        citations: [],
        rewrittenQuery,
        demo: status.demoMode,
        disclaimer: null,
        status,
      });
    }

    if (status.demoMode) {
      const demo = demoAnswer(message);
      const followHint =
        history.length > 0
          ? `\n\n_(Follow-up noted against your earlier question — live mode would re-search with that context.)_`
          : "";
      const missingHint =
        status.missing.length > 0
          ? `\n\n_Missing for live mode: ${status.missing.join("; ")}. Add keys in Cursor app secrets and republish._`
          : "";
      return jsonOk({
        ok: true,
        answer: `${demo.answer}${followHint}${missingHint}`,
        citations: demo.citations,
        rewrittenQuery,
        demo: true,
        disclaimer: demo.disclaimer,
        status,
      });
    }

    const rawHits = await webSearch(rewrittenQuery);
    const hits = rankAndCap(rawHits, getSearchLimit());
    const { answer, citations } = await generateAnswer(
      message,
      rewrittenQuery,
      hits,
      history,
    );
    const disclaimer = needsSafetyDisclaimer(message, answer)
      ? SAFETY_DISCLAIMER
      : null;

    return jsonOk({
      ok: true,
      answer,
      citations,
      rewrittenQuery,
      demo: false,
      disclaimer,
      status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return jsonOk({
      ok: false,
      error: `Could not complete the RV search pipeline: ${msg}`,
      status,
    });
  }
}
