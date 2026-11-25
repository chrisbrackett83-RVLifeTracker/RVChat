import { getTrustedDomains } from "./config";
import type { SearchHit } from "./types";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function domainScore(host: string, prefer: string[]): number {
  if (!host) return 0;
  for (let i = 0; i < prefer.length; i++) {
    const d = prefer[i].toLowerCase();
    if (host === d || host.endsWith(`.${d}`)) {
      // Earlier list entries score slightly higher
      return 100 - Math.min(40, i);
    }
  }
  // Mild boost for PDF manuals / known camping keywords in host
  if (/\.gov$/.test(host)) return 25;
  if (/rv|camp|trailer|motorhome|outdoor/i.test(host)) return 20;
  return 0;
}

function topicPenalty(hit: SearchHit, denyHints: string[]): number {
  const blob = `${hit.title} ${hit.snippet}`.toLowerCase();
  let penalty = 0;
  for (const hint of denyHints) {
    if (blob.includes(hint.toLowerCase())) penalty += 30;
  }
  // Residential HVAC noise for "suburban"
  if (
    /\b(home\s+hvac|residential\s+furnace|central\s+air|furnace\s+for\s+home)\b/i.test(
      blob,
    )
  ) {
    penalty += 40;
  }
  return penalty;
}

/** Prefer trusted RV domains; return top N unique URLs. */
export function rankAndCap(hits: SearchHit[], limit: number): SearchHit[] {
  const { prefer, denyHints } = getTrustedDomains();
  const scored = hits.map((hit) => {
    const host = hostnameOf(hit.url);
    const score = domainScore(host, prefer) - topicPenalty(hit, denyHints);
    return { ...hit, score };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const hit of scored) {
    const key = hit.url.split("#")[0].replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}
