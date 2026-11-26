import { getSearchApiKey, getSearchLimit, resolveSearchProvider } from "./config";
import { timeoutSignal } from "./fetchTimeout";
import type { SearchHit } from "./types";
import { safeHttpUrl } from "./urls";

const SEARCH_TIMEOUT_MS = 10_000;

function mapHits(
  rows: Array<{ title?: string; url?: string; snippet?: string }>,
): SearchHit[] {
  return rows
    .map((r) => {
      const url = safeHttpUrl(r.url);
      if (!url) return null;
      return {
        title: r.title || url,
        url,
        snippet: r.snippet || "",
      };
    })
    .filter((r): r is SearchHit => r !== null);
}

async function searchTavily(query: string, key: string, limit: number): Promise<SearchHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: timeoutSignal(SEARCH_TIMEOUT_MS),
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
  return mapHits(
    (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    })),
  );
}

async function searchSerper(query: string, key: string, limit: number): Promise<SearchHit[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": key,
    },
    signal: timeoutSignal(SEARCH_TIMEOUT_MS),
    body: JSON.stringify({ q: query, num: limit }),
  });
  if (!res.ok) {
    throw new Error(`Serper search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    organic?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return mapHits(
    (data.organic ?? []).map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    })),
  );
}

async function searchBing(query: string, key: string, limit: number): Promise<SearchHit[]> {
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(limit));
  const res = await fetch(url.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": key },
    signal: timeoutSignal(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Bing search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string }> };
  };
  return mapHits(
    (data.webPages?.value ?? []).map((r) => ({
      title: r.name,
      url: r.url,
      snippet: r.snippet,
    })),
  );
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
    signal: timeoutSignal(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Brave search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return mapHits(
    (data.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    })),
  );
}

export async function webSearch(query: string): Promise<SearchHit[]> {
  const provider = resolveSearchProvider();
  if (provider === "none") {
    throw new Error("No search API key configured");
  }
  const key = getSearchApiKey(provider);
  const limit = Math.max(getSearchLimit(), 6); // fetch a few extra before ranking

  try {
    switch (provider) {
      case "tavily":
        return await searchTavily(query, key, limit);
      case "serper":
        return await searchSerper(query, key, limit);
      case "bing":
        return await searchBing(query, key, limit);
      case "brave":
        return await searchBrave(query, key, limit);
      default:
        throw new Error(`Unsupported search provider: ${provider}`);
    }
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "TimeoutError" ||
        err.name === "AbortError" ||
        /aborted due to timeout|signal timed out/i.test(err.message))
    ) {
      throw new Error(
        `Web search timed out (${provider}). Wait a moment and try again.`,
      );
    }
    throw err;
  }
}
