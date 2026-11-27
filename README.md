# My RV Assistant

Personal-first RV / camping chatbot MVP for **Chris Brackett**.

Every question is rewritten into an RV / camping / full-time context, searched via a web search API, ranked toward trusted RV domains, then answered by an LLM with citation links. Soft safety disclaimers appear for electrical / propane / brake topics.

**Completely separate from RVLifeTracker** — this is its own app and repo.

## Stack

- Next.js (App Router) + one `/api/chat` route
- Gemini (preferred) or OpenAI
- Search: Tavily / Serper / Bing / Brave (env-selected)
- Demo mode when keys are missing (labeled sample answers for UI testing)

## Quick start

```bash
cd /agent/rv-chat   # or your clone path
cp .env.example .env.local
# edit .env.local with your keys (optional — demo mode works without them)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Required for live | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | One of Gemini/OpenAI | Preferred LLM (free tier friendly) |
| `OPENAI_API_KEY` | One of Gemini/OpenAI | Fallback if Gemini unset |
| `SEARCH_PROVIDER` | No (default `tavily`) | `tavily` \| `serper` \| `bing` \| `brave` |
| `SEARCH_API_KEY` | One search key | Shared key for the chosen provider |
| `TAVILY_API_KEY` | Alt | Used if `SEARCH_API_KEY` empty |
| `SERPER_API_KEY` | Alt | Serper |
| `BING_API_KEY` | Alt | Azure Bing Web Search |
| `BRAVE_API_KEY` | Alt | Brave Search |
| `SEARCH_RESULT_LIMIT` | No | Cap sources ~3–5 (default 5) |
| `DEMO_MODE` | No | `true` forces demo answers even with keys |
| `GEMINI_MODEL` / `OPENAI_MODEL` | No | Model overrides |

Without LLM **or** search keys, the API returns **demo mode** sample RV answers with clear labeling — the UI does not crash.

## Pipeline

1. **Query rewrite** — add RV brand/context (e.s. “suburban furnace diagram” → Suburban RV furnace + manual phrasing)
2. **Web search API** — no Google HTML scraping, no custom crawler
3. **Domain prefer-list** — `data/trusted-domains.json` (Suburban, Dometic, Lippert, iRV2, Air Forums, manuals, etc.)
4. **LLM answer** — citations limited to retrieved URLs
5. **Guardrails** — soft off-topic note + safety disclaimer for electrical/propane/brakes

## Trusted domains

Edit `data/trusted-domains.json` to tune the prefer list. Ranking boosts hostname suffix matches; residential HVAC-ish snippets are downranked.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run lint` | ESLint |

## Out of scope (v1)

Auth, multi-user, custom crawler, merging into RVLifeTracker.
