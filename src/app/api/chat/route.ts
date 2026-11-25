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
import { rewriteQueryForRv } from "@/lib/rewrite";
import { webSearch } from "@/lib/search";
import type { ChatApiResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const status = getProviderStatus();

  const identity = await requireIdentity(req);
  if (identity instanceof Response) {
    // Always JSON so the browser UI never fails parsing HTML/error pages.
    const res: ChatApiResponse = {
      ok: false,
      error: "Sign in to Cursor to use RV Chat.",
      status,
    };
    return NextResponse.json(res, { status: 401 });
  }

  let body: { message?: string };
  try {
    body = (await req.json()) as { message?: string };
  } catch {
    const res: ChatApiResponse = {
      ok: false,
      error: "Send a JSON body with a message string.",
      status,
    };
    return NextResponse.json(res, { status: 400 });
  }

  const message = (body.message || "").trim();
  if (!message) {
    const res: ChatApiResponse = {
      ok: false,
      error: "Please enter a question.",
      status,
    };
    return NextResponse.json(res, { status: 400 });
  }

  if (message.length > 2000) {
    const res: ChatApiResponse = {
      ok: false,
      error: "Please keep questions under 2000 characters.",
      status,
    };
    return NextResponse.json(res, { status: 400 });
  }

  const guard = softGuardrailNote(message);
  if (guard) {
    const res: ChatApiResponse = {
      ok: true,
      answer: guard,
      citations: [],
      rewrittenQuery: rewriteQueryForRv(message),
      demo: status.demoMode,
      disclaimer: null,
      status,
    };
    return NextResponse.json(res);
  }

  // Demo path when keys missing or DEMO_MODE=true
  if (status.demoMode) {
    const demo = demoAnswer(message);
    const missingHint =
      status.missing.length > 0
        ? `\n\n_Missing for live mode: ${status.missing.join("; ")}. Copy \`.env.example\` to \`.env.local\` and restart._`
        : "";
    const res: ChatApiResponse = {
      ok: true,
      answer: `${demo.answer}${missingHint}`,
      citations: demo.citations,
      rewrittenQuery: demo.rewrittenQuery,
      demo: true,
      disclaimer: demo.disclaimer,
      status,
    };
    return NextResponse.json(res);
  }

  try {
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

    const res: ChatApiResponse = {
      ok: true,
      answer,
      citations,
      rewrittenQuery,
      demo: false,
      disclaimer,
      status,
    };
    return NextResponse.json(res);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    const res: ChatApiResponse = {
      ok: false,
      error: `Could not complete the RV search pipeline: ${msg}`,
      status,
    };
    return NextResponse.json(res, { status: 502 });
  }
}
