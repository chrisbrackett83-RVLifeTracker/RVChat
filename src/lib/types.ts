export type ChatRole = "user" | "assistant";

export type Citation = {
  title: string;
  url: string;
  snippet?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  citations?: Citation[];
  rewrittenQuery?: string;
  demo?: boolean;
  disclaimer?: string;
};

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  score?: number;
};

export type ProviderStatus = {
  demoMode: boolean;
  llm: "gemini" | "openai" | "none";
  search: "tavily" | "serper" | "bing" | "brave" | "none";
  missing: string[];
};

export type ChatApiSuccess = {
  ok: true;
  answer: string;
  citations: Citation[];
  rewrittenQuery: string;
  demo: boolean;
  disclaimer: string | null;
  status: ProviderStatus;
};

export type ChatApiError = {
  ok: false;
  error: string;
  status: ProviderStatus;
};

export type ChatApiResponse = ChatApiSuccess | ChatApiError;
