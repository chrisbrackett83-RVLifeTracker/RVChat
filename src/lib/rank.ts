import { getTrustedDomains } from "./config";
import type { SearchHit } from "./types";

/** Preferred source channel order (higher base → preferred when quality is similar). */
export type SourceChannel = "website" | "youtube" | "forum" | "social";

const CHANNEL_BASE: Record<SourceChannel, number> = {
  website: 40,
  youtube: 25,
  forum: 15,
  social: 0,
};

const FORUM_HOSTS = [
  "irv2.com",
  "airforums.com",
  "rvforum.net",
  "rv.net",
  "rvforum.com",
  "expeditionportal.com",
  "outdoorforum.com",
  "trailersforum.com",
  "classbforum.com",
  "forest-river-forums.com",
  "jaycoowners.com",
  "airstreamforums.com",
  "thorforums.com",
  "winnebagoowners.com",
  "granddesignowners.com",
  "keystoneowners.com",
  "reddit.com",
  "quora.com",
  "stackexchange.com",
  "stackoverflow.com",
];

const SOCIAL_HOSTS = [
  "facebook.com",
  "fb.com",
  "m.facebook.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "threads.net",
  "pinterest.com",
  "linkedin.com",
  "tumblr.com",
  "snapchat.com",
  "truthsocial.com",
  "nextdoor.com",
];

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostMatches(host: string, domains: string[]): boolean {
  if (!host) return false;
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Classify a result URL into website / youtube / forum / social. */
export function classifySource(url: string): SourceChannel {
  const host = hostnameOf(url);
  if (!host) return "website";

  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtu.be" ||
    host.endsWith(".youtube.com")
  ) {
    return "youtube";
  }

  if (hostMatches(host, SOCIAL_HOSTS)) return "social";
  if (hostMatches(host, FORUM_HOSTS)) return "forum";

  // Path hints for forum software on otherwise generic hosts
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (
      /\/(forum|forums|threads?|topic|showthread|viewtopic)\b/.test(path) ||
      /[?&]t=\d+/.test(url)
    ) {
      return "forum";
    }
  } catch {
    /* ignore */
  }

  return "website";
}

function wordCount(text: string): number {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.length;
}

/**
 * Estimate content quality from title + snippet (0–55).
 * Rich, detailed writeups score high so they can outrank a thin higher-channel source.
 */
export function qualityScore(hit: SearchHit): number {
  const title = hit.title?.trim() || "";
  const snippet = hit.snippet?.trim() || "";
  const blob = `${title} ${snippet}`;
  const words = wordCount(blob);
  const snippetWords = wordCount(snippet);

  let score = 0;

  // Length / detail of available text
  if (snippetWords >= 80) score += 28;
  else if (snippetWords >= 45) score += 22;
  else if (snippetWords >= 25) score += 14;
  else if (snippetWords >= 12) score += 7;
  else if (snippetWords >= 5) score += 3;

  if (wordCount(title) >= 6) score += 4;
  else if (wordCount(title) >= 3) score += 2;

  // Technical / how-to depth signals
  const depthHits = [
    /\b\d+(\.\d+)?\s?(amp|amps|a|v|volt|volts|psi|btu|watt|watts|awg|gauge)\b/i,
    /\b(step[s]?|procedure|diagram|schematic|torque|wiring|manual|install|troubleshoot)\b/i,
    /\b(part\s?#?\s?\w[\w-]*|model\s+[a-z0-9-]+)\b/i,
    /\b(because|however|therefore|instead|recommend)\b/i,
  ].filter((re) => re.test(blob)).length;
  score += Math.min(12, depthHits * 3);

  // Sentence structure suggests real prose vs a tagline
  if (/[.!?]/.test(snippet) && snippetWords >= 15) score += 5;

  // Thin / low-signal content
  if (snippetWords < 8) score -= 12;
  if (
    /\b(watch (this )?video|click here|subscribe|follow us|like and share)\b/i.test(
      blob,
    )
  ) {
    score -= 8;
  }
  if (/^https?:\/\//i.test(title) || title.length < 8) score -= 4;

  // Very long detailed posts get a small extra bump
  if (words >= 120) score += 6;

  return Math.max(0, Math.min(55, score));
}

function trustedDomainBonus(host: string, prefer: string[]): number {
  if (!host) return 0;
  for (let i = 0; i < prefer.length; i++) {
    const d = prefer[i].toLowerCase();
    if (host === d || host.endsWith(`.${d}`)) {
      // Soft boost so manufacturers still rise, without wiping channel/quality order
      return 22 - Math.min(12, Math.floor(i / 3));
    }
  }
  if (/\.gov$/.test(host)) return 12;
  if (/rv|camp|trailer|motorhome|outdoor/i.test(host)) return 6;
  return 0;
}

function topicPenalty(hit: SearchHit, denyHints: string[]): number {
  const blob = `${hit.title} ${hit.snippet}`.toLowerCase();
  let penalty = 0;
  for (const hint of denyHints) {
    if (blob.includes(hint.toLowerCase())) penalty += 30;
  }
  if (
    /\b(home\s+hvac|residential\s+furnace|central\s+air|furnace\s+for\s+home)\b/i.test(
      blob,
    )
  ) {
    penalty += 40;
  }
  return penalty;
}

export function scoreHit(
  hit: SearchHit,
  prefer: string[],
  denyHints: string[],
): number {
  const host = hostnameOf(hit.url);
  const channel = classifySource(hit.url);
  const quality = qualityScore(hit);
  return (
    CHANNEL_BASE[channel] +
    quality +
    trustedDomainBonus(host, prefer) -
    topicPenalty(hit, denyHints)
  );
}

/**
 * Rank hits: website > YouTube > forums > social when quality is similar,
 * but rich detailed content can outrank a thin higher-channel source.
 * Returns top N unique URLs.
 */
export function rankAndCap(hits: SearchHit[], limit: number): SearchHit[] {
  const { prefer, denyHints } = getTrustedDomains();
  const scored = hits.map((hit) => ({
    ...hit,
    score: scoreHit(hit, prefer, denyHints),
  }));

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
