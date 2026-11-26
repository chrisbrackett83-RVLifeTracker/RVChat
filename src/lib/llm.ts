import type { Citation, SearchHit } from "./types";
import { resolveLlm } from "./config";
import { timeoutSignal } from "./fetchTimeout";
import { safeHttpUrl } from "./urls";

const SYSTEM = `You are RV Chat, a personal assistant for RV owners, campers, and full-time RVers.
Always interpret questions in an RV / camping / travel-trailer / motorhome context
(e.g. "suburban furnace" means Suburban RV furnace, not a residential home HVAC unit).
Write concise, practical answers. Use ONLY the provided source URLs for citations—
never invent links. Cite sources inline as [1], [2], etc. matching the numbered list.
If sources are thin, say what is uncertain. Do not republish entire manuals.`;

const GEMINI_ATTEMPT_MS = 10_000;
const OPENAI_ATTEMPT_MS = 15_000;

function buildUserPrompt(question: string, rewritten: string, hits: SearchHit[]): string {
  const sources = hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.title}\nURL: ${h.url}\nSnippet: ${h.snippet.slice(0, 400)}`,
    )
    .join("\n\n");

  return `User question: ${question}
RV-context search query used: ${rewritten}

Sources (cite only these URLs):
${sources || "(none)"}

Write a helpful RV-focused answer with inline [n] citations. End with a short "Sources" list repeating the used [n] titles.`;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "TimeoutError" ||
    err.name === "AbortError" ||
    /aborted due to timeout|signal timed out|AbortError/i.test(err.message)
  );
}

function isRetryableGemini(msg: string): boolean {
  return /(?:503|429|404|high demand|UNAVAILABLE|not found|no longer available|timed out|timeout|aborted)/i.test(
    msg,
  );
}

/** Prefer one primary + one alternate so total wait stays under host limits. */
function geminiModels(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  // Keep cascade on currently offered models only (2.5-flash-lite is retired).
  const alternate =
    preferred === "gemini-3.5-flash-lite"
      ? "gemini-3.8-flash"
      : "gemini-3.5-flash-lite";
  return [...new Set([preferred, alternate])];
}

async function callGeminiModel(
  prompt: string,
  key: string,
  model: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
      }),
      signal: timeoutSignal(GEMINI_ATTEMPT_MS),
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error(`Gemini timed out after ${GEMINI_ATTEMPT_MS / 1000}s`);
    }
    throw err;
  }
  if (res.status === 503 || res.status === 429) {
    throw new Error(`Gemini error (${res.status}): high demand`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini error (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
    "";
  if (!text.trim()) throw new Error("Gemini returned an empty answer");
  return text.trim();
}

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY!.trim();
  const models = geminiModels();
  let lastErr = "Gemini request failed";

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    if (i > 0) await sleep(250);
    try {
      return await callGeminiModel(prompt, key, model);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gemini request failed";
      lastErr = `${msg} (model ${model})`;
      if (isRetryableGemini(msg)) continue;
      throw err;
    }
  }

  throw new Error(
    `${lastErr}. The AI provider was slow or busy — wait a minute and try again, or add an OPENAI_API_KEY fallback.`,
  );
}

async function callOpenAI(prompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY!.trim();
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: timeoutSignal(OPENAI_ATTEMPT_MS),
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error(`OpenAI timed out after ${OPENAI_ATTEMPT_MS / 1000}s`);
    }
    throw err;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error("OpenAI returned an empty answer");
  return text.trim();
}

function friendlyUpstreamError(err: unknown): Error {
  if (isTimeoutError(err)) {
    return new Error(
      "The AI took too long to respond. Wait a moment and try again.",
    );
  }
  if (err instanceof Error) return err;
  return new Error("Unexpected LLM error");
}

export async function generateAnswer(
  question: string,
  rewritten: string,
  hits: SearchHit[],
): Promise<{ answer: string; citations: Citation[] }> {
  const llm = resolveLlm();
  if (llm === "none") throw new Error("No LLM API key configured");

  const prompt = buildUserPrompt(question, rewritten, hits);
  let answer: string;

  if (llm === "gemini") {
    try {
      answer = await callGemini(prompt);
    } catch (geminiErr) {
      if (process.env.OPENAI_API_KEY?.trim()) {
        try {
          answer = await callOpenAI(prompt);
        } catch {
          throw friendlyUpstreamError(geminiErr);
        }
      } else {
        throw friendlyUpstreamError(geminiErr);
      }
    }
  } else {
    try {
      answer = await callOpenAI(prompt);
    } catch (err) {
      throw friendlyUpstreamError(err);
    }
  }

  // Only expose http(s) URLs that were actually retrieved (citation honesty)
  const citations: Citation[] = [];
  for (const h of hits.slice(0, 5)) {
    const url = safeHttpUrl(h.url);
    if (!url) continue;
    citations.push({
      title: h.title,
      url,
      snippet: h.snippet.slice(0, 180),
    });
  }

  return { answer, citations };
}
