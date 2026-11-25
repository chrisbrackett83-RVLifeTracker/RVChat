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

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY!.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const payload = {
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
  };

  let lastErr = "Gemini request failed";
  // Keep retries short so the host doesn't time out with an HTML 502 page.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(600);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: timeoutSignal(20_000),
      });
    } catch (err) {
      lastErr =
        err instanceof Error ? `Gemini request failed: ${err.message}` : lastErr;
      continue;
    }
    if (res.status === 503 || res.status === 429) {
      lastErr = `Gemini error (${res.status}): high demand`;
      continue;
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
  throw new Error(
    `${lastErr}. Gemini is busy — wait a minute and try again.`,
  );
}

async function callOpenAI(prompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY!.trim();
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    signal: timeoutSignal(20_000),
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
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

export async function generateAnswer(
  question: string,
  rewritten: string,
  hits: SearchHit[],
): Promise<{ answer: string; citations: Citation[] }> {
  const llm = resolveLlm();
  if (llm === "none") throw new Error("No LLM API key configured");

  const prompt = buildUserPrompt(question, rewritten, hits);
  const answer = llm === "gemini" ? await callGemini(prompt) : await callOpenAI(prompt);

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
