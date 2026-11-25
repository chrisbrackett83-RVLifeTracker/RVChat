import { readFileSync } from "fs";
import path from "path";
import type { ProviderStatus } from "./types";

export type TrustedDomains = {
  prefer: string[];
  denyHints: string[];
};

let cachedDomains: TrustedDomains | null = null;

export function getTrustedDomains(): TrustedDomains {
  if (cachedDomains) return cachedDomains;
  const file = path.join(process.cwd(), "data", "trusted-domains.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as TrustedDomains;
  cachedDomains = {
    prefer: raw.prefer ?? [],
    denyHints: raw.denyHints ?? [],
  };
  return cachedDomains;
}

export function getSearchLimit(): number {
  const n = Number(process.env.SEARCH_RESULT_LIMIT ?? "5");
  if (!Number.isFinite(n)) return 5;
  return Math.min(8, Math.max(3, Math.floor(n)));
}

export function resolveLlm(): ProviderStatus["llm"] {
  if (process.env.GEMINI_API_KEY?.trim()) return "gemini";
  if (process.env.OPENAI_API_KEY?.trim()) return "openai";
  return "none";
}

export function resolveSearchProvider(): ProviderStatus["search"] {
  const preferred = (process.env.SEARCH_PROVIDER || "tavily").toLowerCase();
  const has = (key?: string) => Boolean(key?.trim());

  const providers: Array<{
    id: ProviderStatus["search"];
    ready: boolean;
  }> = [
    {
      id: "tavily",
      ready: has(process.env.SEARCH_API_KEY) || has(process.env.TAVILY_API_KEY),
    },
    {
      id: "serper",
      ready: has(process.env.SEARCH_API_KEY) || has(process.env.SERPER_API_KEY),
    },
    {
      id: "bing",
      ready: has(process.env.SEARCH_API_KEY) || has(process.env.BING_API_KEY),
    },
    {
      id: "brave",
      ready: has(process.env.SEARCH_API_KEY) || has(process.env.BRAVE_API_KEY),
    },
  ];

  const match = providers.find((p) => p.id === preferred && p.ready);
  if (match) return match.id;
  const any = providers.find((p) => p.ready);
  return any?.id ?? "none";
}

export function getSearchApiKey(provider: ProviderStatus["search"]): string {
  const shared = process.env.SEARCH_API_KEY?.trim();
  if (shared) return shared;
  switch (provider) {
    case "tavily":
      return process.env.TAVILY_API_KEY?.trim() || "";
    case "serper":
      return process.env.SERPER_API_KEY?.trim() || "";
    case "bing":
      return process.env.BING_API_KEY?.trim() || "";
    case "brave":
      return process.env.BRAVE_API_KEY?.trim() || "";
    default:
      return "";
  }
}

export function getProviderStatus(): ProviderStatus {
  const forceDemo = process.env.DEMO_MODE === "true";
  const llm = resolveLlm();
  const search = resolveSearchProvider();
  const missing: string[] = [];

  if (llm === "none") {
    missing.push("GEMINI_API_KEY or OPENAI_API_KEY");
  }
  if (search === "none") {
    missing.push(
      "SEARCH_API_KEY (or TAVILY_API_KEY / SERPER_API_KEY / BING_API_KEY / BRAVE_API_KEY)",
    );
  }

  return {
    demoMode: forceDemo || llm === "none" || search === "none",
    llm,
    search,
    missing,
  };
}
