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

function geminiModels(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const cascade = [
    preferred,
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
  ].filter((m): m is string => Boolean(m));
  return [...new Set(cascade)];
}

async function callGeminiModel(
  prompt: string,
  key: string,
  model: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
    }),
    signal: timeoutSignal(20_000),
  });
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
    if (i > 0) await sleep(400);
    try {
      return await callGeminiModel(prompt, key, model);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gemini request failed";
      lastErr = `${msg} (model ${model})`;
      // Capacity / not-found / unavailable → try next model
      if (
        /(?:503|429|404|high demand|UNAVAILABLE|not found|no longer available)/i.test(
          msg,
        )
      ) {
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `${lastErr}. Gemini is busy — wait a minute and try again, or add an OPENAI_API_KEY fallback.`,
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
  let answer: string;

  if (llm === "gemini") {
    try {
      answer = await callGemini(prompt);
    } catch (geminiErr) {
      if (process.env.OPENAI_API_KEY?.trim()) {
        try {
          answer = await callOpenAI(prompt);
        } catch {
          throw geminiErr;
        }
      } else {
        throw geminiErr;
      }
    }
  } else {
    answer = await callOpenAI(prompt);
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
