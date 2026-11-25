const SAFETY_TOPICS =
  /\b(electr|propane|lp\b|gas\s*line|brake|inverter|shore\s*power|12\s*v|120\s*v|battery\s*bank|wiring|fuse|gfci|generator)\b/i;

export const SAFETY_DISCLAIMER =
  "Safety note: This is general RV guidance, not a substitute for a qualified technician or the manufacturer’s instructions—especially for electrical, propane, and brake work.";

export function needsSafetyDisclaimer(question: string, answer: string): boolean {
  return SAFETY_TOPICS.test(question) || SAFETY_TOPICS.test(answer);
}

export function softGuardrailNote(question: string): string | null {
  // Soft: we still answer RV-framed questions; only flag clearly off-topic after rewrite context
  if (
    /\b(stock\s*market|cryptocurrency|medical\s*diagnos|prescribe\s*medication)\b/i.test(
      question,
    )
  ) {
    return "This assistant focuses on RV and camping topics. For medical or financial decisions, please consult a professional.";
  }
  return null;
}
