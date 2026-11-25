import type { Citation } from "./types";
import { rewriteQueryForRv } from "./rewrite";
import { needsSafetyDisclaimer, SAFETY_DISCLAIMER } from "./guardrails";

type DemoPack = {
  match: RegExp;
  answer: string;
  citations: Citation[];
};

const PACKS: DemoPack[] = [
  {
    match: /suburban|furnace|sf-?35/i,
    answer: `In an RV context, “Suburban furnace” means a **Suburban Manufacturing** coach furnace (not a home HVAC unit).

After winter storage, a typical restart checklist:
1. Confirm LP tanks are full, open, and that the regulator vents outdoors.
2. Restore 12V coach power — the circuit board and blower need battery/converter voltage.
3. Set the thermostat to heat and give the board time for its try sequence (you should hear the inducer/blower, then ignition).
4. If it lights then shuts off, check the sail switch, sail switch tubing/obstructions, and exhaust/intake for wasp nests or winter covers left on.
5. For wiring diagrams (e.g. SF-35), prefer the manufacturer service manual PDF rather than residential furnace pages.

[1][2] Demo sources below are illustrative placeholders for UI testing.`,
    citations: [
      {
        title: "Suburban RV Furnace — product / support (demo)",
        url: "https://www.suburbanmfg.com/",
        snippet: "Manufacturer site for Suburban RV heating products.",
      },
      {
        title: "iRV2 — furnace troubleshooting threads (demo)",
        url: "https://www.irv2.com/",
        snippet: "Owner forums discussing Suburban furnace ignition and sail switches.",
      },
      {
        title: "Air Forums — RV furnace discussions (demo)",
        url: "https://www.airforums.com/",
        snippet: "Airstream / RV community furnace and LP heat topics.",
      },
    ],
  },
  {
    match: /dometic|refrigerator|thermostat/i,
    answer: `Treating this as **Dometic RV** equipment (absorption or compressor fridge / coach thermostat).

If a Dometic fridge runs on AC but not LP, check first:
- LP supply and regulator pressure at the fridge.
- Clean burner orifice / spider webs (very common after storage).
- That the unit is reasonably level (absorption fridges).
- Board fault codes / reignition attempts with 12V present.

A blank thermostat often means lost 12V to the control, a bad display, or a tripped fuse on the coach DC panel — not a residential Nest-style issue.

Demo mode: sample citations only.`,
    citations: [
      {
        title: "Dometic support (demo)",
        url: "https://www.dometic.com/",
        snippet: "Official Dometic manuals and support.",
      },
      {
        title: "iRV2 refrigerator / thermostat threads (demo)",
        url: "https://www.irv2.com/",
        snippet: "Owner troubleshooting for AC vs LP cooling.",
      },
    ],
  },
  {
    match: /lippert|slide/i,
    answer: `Interpreting this as a **Lippert (LCI) RV slide-out** issue.

If a slide won’t retract: verify coach battery voltage under load, check the slide controller/reset, inspect for binding or debris on the seals, and confirm the lock/override procedure in the Lippert manual for your mechanism (Schwintek vs rack-and-pinion differ).

Demo citations for UI testing:`,
    citations: [
      {
        title: "Lippert / LCI support (demo)",
        url: "https://www.lci1.com/",
        snippet: "Slide-out manuals and tech docs.",
      },
      {
        title: "iRV2 slide-out troubleshooting (demo)",
        url: "https://www.irv2.com/",
        snippet: "Owner reports on Lippert slide motors and controllers.",
      },
    ],
  },
];

const FALLBACK: DemoPack = {
  match: /.*/,
  answer: `**Demo mode** — no live LLM/search keys are configured, so this is a sample RV-context answer for UI testing.

Your question was rewritten toward RV / camping / full-time travel-trailer use. With real keys, RV Chat would: rewrite the query → call a web search API → prefer trusted RV domains (Suburban, Dometic, Lippert, iRV2, manuals, etc.) → draft an answer with real source links.

Add \`GEMINI_API_KEY\` (or \`OPENAI_API_KEY\`) plus a search key (\`TAVILY_API_KEY\` / \`SEARCH_API_KEY\`, etc.) to \`.env.local\` and restart the server for live answers.`,
  citations: [
    {
      title: "iRV2 forums (demo)",
      url: "https://www.irv2.com/",
      snippet: "Large RV owner community.",
    },
    {
      title: "Air Forums (demo)",
      url: "https://www.airforums.com/",
      snippet: "RV / Airstream discussion boards.",
    },
    {
      title: "Recreation.gov (demo)",
      url: "https://www.recreation.gov/",
      snippet: "Public campground reservations.",
    },
  ],
};

export function demoAnswer(question: string): {
  answer: string;
  citations: Citation[];
  rewrittenQuery: string;
  disclaimer: string | null;
} {
  const rewrittenQuery = rewriteQueryForRv(question);
  const pack = PACKS.find((p) => p.match.test(question)) ?? FALLBACK;
  const disclaimer = needsSafetyDisclaimer(question, pack.answer)
    ? SAFETY_DISCLAIMER
    : null;
  return {
    answer: pack.answer,
    citations: pack.citations,
    rewrittenQuery,
    disclaimer,
  };
}
