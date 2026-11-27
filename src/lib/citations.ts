import type { Citation } from "./types";

/** Collect 1-based citation numbers referenced as [n] in answer text. */
export function citedNumbers(text: string): Set<number> {
  const used = new Set<number>();
  const re = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) used.add(n);
  }
  return used;
}

/** Drop a trailing LLM "Sources:" / "Source:" block — the UI renders its own list. */
export function stripTrailingSourcesSection(answer: string): string {
  const trimmed = answer.trimEnd();
  const match = trimmed.match(/\n+(?:#{1,3}\s*)?(?:\*\*)?Sources?:?(?:\*\*)?\s*\n[\s\S]*$/i);
  if (!match || match.index === undefined) return trimmed;
  // Only strip if it looks like a citation list ([n] …)
  const block = match[0];
  if (!/\[\d+\]/.test(block)) return trimmed;
  return trimmed.slice(0, match.index).trimEnd();
}

/** Footer rows: only sources that appear as [n] in the answer body. */
export function displayCitations(
  answer: string,
  citations: Citation[],
): { index: number; citation: Citation }[] {
  const used = citedNumbers(answer);
  const rows: { index: number; citation: Citation }[] = [];
  citations.forEach((c, i) => {
    const n = i + 1;
    if (used.has(n)) rows.push({ index: n, citation: c });
  });
  return rows;
}
