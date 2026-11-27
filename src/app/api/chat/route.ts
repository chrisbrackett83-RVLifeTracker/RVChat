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
import { rewriteQueryForRv } from "@/lib/rewrite";
import { webSearch } from "@/lib/search";
import type { ChatApiResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonOk(body: ChatApiResponse, status = 200) {
  // Prefer HTTP 200 for app-level failures so the host doesn't replace the
  // body with an HTML gateway error page (which the UI can't parse).
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
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

    let body: { message?: string };
    try {
      body = (await req.json()) as { message?: string };
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

    const guard = softGuardrailNote(message);
    if (guard) {
      return jsonOk({
        ok: true,
        answer: guard,
        citations: [],
        rewrittenQuery: rewriteQueryForRv(message),
        demo: status.demoMode,
        disclaimer: null,
        status,
      });
    }

    if (status.demoMode) {
      const demo = demoAnswer(message);
      const missingHint =
        status.missing.length > 0
          ? `\n\n_Missing for live mode: ${status.missing.join("; ")}. Add keys in Cursor app secrets and republish._`
          : "";
      return jsonOk({
        ok: true,
        answer: `${demo.answer}${missingHint}`,
        citations: demo.citations,
        rewrittenQuery: demo.rewrittenQuery,
        demo: true,
        disclaimer: demo.disclaimer,
        status,
      });
    }

    const rewrittenQuery = rewriteQueryForRv(message);
    const rawHits = await webSearch(rewrittenQuery);
    const hits = rankAndCap(rawHits, getSearchLimit());
    const { answer, citations } = await generateAnswer(
      message,
      rewrittenQuery,
      hits,
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
