const RV_BRAND_HINTS: Array<{ pattern: RegExp; rewrite: string }> = [
  { pattern: /\bsuburban\b/i, rewrite: "Suburban RV furnace" },
  { pattern: /\bdometic\b/i, rewrite: "Dometic RV" },
  { pattern: /\blippert\b/i, rewrite: "Lippert RV" },
  { pattern: /\batwood\b/i, rewrite: "Atwood RV" },
  { pattern: /\bprogressive\s+dynamics\b/i, rewrite: "Progressive Dynamics RV converter" },
  { pattern: /\bequalizer\s+hitch\b/i, rewrite: "Equalizer weight distribution hitch travel trailer" },
  { pattern: /\bfantastic\s+fan\b/i, rewrite: "Fantastic Fan RV vent" },
  { pattern: /\bnorcold\b/i, rewrite: "Norcold RV refrigerator" },
  { pattern: /\btruma\b/i, rewrite: "Truma RV" },
];

const ALREADY_RV =
  /\b(rv|motorhome|travel\s*trailer|fifth[\s-]?wheel|camper|coach|boondock|full[\s-]?tim)/i;

/** Deterministic RV context rewrite (used always; LLM can refine later). */
export function rewriteQueryForRv(question: string): string {
  const q = question.trim().replace(/\s+/g, " ");
  if (!q) return "RV camping question";

  let rewritten = q;
  for (const hint of RV_BRAND_HINTS) {
    if (hint.pattern.test(q) && !ALREADY_RV.test(q)) {
      rewritten = `${hint.rewrite}: ${q}`;
      break;
    }
  }

  if (!ALREADY_RV.test(rewritten)) {
    rewritten = `${rewritten} RV camping motorhome travel trailer`;
  }

  // Prefer manual / diagram phrasing when the user asks for diagrams
  if (/\bdiagram\b/i.test(q) && !/\bmanual\b/i.test(rewritten)) {
    rewritten = `${rewritten} wiring diagram manufacturer manual`;
  }

  return rewritten;
}
