import { getSearchApiKey, getSearchLimit, resolveSearchProvider } from "./config";
import type { SearchHit } from "./types";

async function searchTavily(query: string, key: string, limit: number): Promise<SearchHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: limit,
      search_depth: "basic",
      include_answer: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Tavily search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title || r.url || "Source",
      url: r.url!,
      snippet: r.content || "",
    }));
}

async function searchSerper(query: string, key: string, limit: number): Promise<SearchHit[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": key,
    },
    body: JSON.stringify({ q: query, num: limit }),
  });
  if (!res.ok) {
    throw new Error(`Serper search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return (data.organic ?? [])
    .filter((r) => r.link)
    .map((r) => ({
      title: r.title || r.link || "Source",
      url: r.link!,
      snippet: r.snippet || "",
    }));
}

async function searchBing(query: string, key: string, limit: number): Promise<SearchHit[]> {
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(limit));
  const res = await fetch(url.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": key },
  });
  if (!res.ok) {
    throw new Error(`Bing search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string }> };
  };
  return (data.webPages?.value ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      title: r.name || r.url || "Source",
      url: r.url!,
      snippet: r.snippet || "",
    }));
}

async function searchBrave(query: string, key: string, limit: number): Promise<SearchHit[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(limit));
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key,
    },
  });
  if (!res.ok) {
    throw new Error(`Brave search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return (data.web?.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title || r.url || "Source",
      url: r.url!,
      snippet: r.description || "",
    }));
}

export async function webSearch(query: string): Promise<SearchHit[]> {
  const provider = resolveSearchProvider();
  if (provider === "none") {
    throw new Error("No search API key configured");
  }
  const key = getSearchApiKey(provider);
  const limit = Math.max(getSearchLimit(), 6); // fetch a few extra before ranking

  switch (provider) {
    case "tavily":
      return searchTavily(query, key, limit);
    case "serper":
      return searchSerper(query, key, limit);
    case "bing":
      return searchBing(query, key, limit);
    case "brave":
      return searchBrave(query, key, limit);
    default:
      throw new Error(`Unsupported search provider: ${provider}`);
  }
}
