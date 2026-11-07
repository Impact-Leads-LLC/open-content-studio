import { BOOKING_OFFER, OFFER_IDEA, OWNER } from "./brand";

// Every piece the studio suggests is built for one awareness stage and sits at one funnel position (the brain doc
// "Content Strategy" can say more): much of an audience doesn't yet know the owner's approach is an answer, so the board
// needs plenty of pieces that open the idea, not only ones for people already shopping. Schwartz's five levels of
// awareness, with content at each one.
export const AWARENESS = ["unaware", "problem", "solution", "product", "most"] as const;
export type Awareness = (typeof AWARENESS)[number];
export const FUNNELS = ["top", "middle", "bottom"] as const;
export type Funnel = (typeof FUNNELS)[number];
export const FUNNEL_OF: Record<Awareness, Funnel> = { unaware: "top", problem: "top", solution: "middle", product: "bottom", most: "bottom" };

export const STAGE_LABEL: Record<Awareness, string> = { unaware: "Unaware", problem: "Problem-aware", solution: "Solution-aware", product: "Product-aware", most: "Most aware" };
export const FUNNEL_LABEL: Record<Funnel, string> = { top: "Top of funnel", middle: "Middle of funnel", bottom: "Bottom of funnel" };
// Who the reader is at each stage and what a piece for them does, for the prompts that plan and write the pieces.
export const STAGE_BRIEF: Record<Awareness, string> = {
  unaware: `doesn't know the idea is an answer at all (for ${OWNER}'s main offer: doesn't know yet that ${OFFER_IDEA}). Open the idea with a story, a surprising result, or the idea itself.`,
  problem: "feels the problem (in the words the brand brief gives for the ideal client's pain) but doesn't see this as the answer. Name the problem in their words, show what it costs, hint at the way out.",
  solution: "knows the approach exists (often with a wrong idea of what it's for) or doesn't know how to do it well. Show how it works: the mechanism, the mistakes, comparisons, the numbers.",
  product: `knows ${OWNER} and what ${OWNER} offers but isn't sure it's for them. Proof and trust: client results, how the work goes, objections answered.`,
  most: `knows ${OWNER} and the offer and is close to booking. The reason to act now: what ${BOOKING_OFFER} gets them, what happens on the call, a client result, the next step made easy.`,
};

const ALIAS: Record<string, Awareness> = { unaware: "unaware", un: "unaware", problem: "problem", solution: "solution", product: "product", most: "most" };
const FUNNEL_ALIAS: Record<string, Funnel> = { top: "top", tofu: "top", middle: "middle", mid: "middle", mofu: "middle", bottom: "bottom", bofu: "bottom" };

// The model's answer, made safe for the columns: "Problem-aware", "problem_aware" or "problem" all read as problem; a
// valid stage sets the funnel (the brain doc's mapping is fixed); anything else is null.
export function cleanStage(awareness: unknown, funnel: unknown): { awareness: Awareness | null; funnel: Funnel | null } {
  const a = ALIAS[String(awareness ?? "").toLowerCase().replace(/[\s_-]*aware(ness)?\b/, "").trim()] ?? null;
  if (a) return { awareness: a, funnel: FUNNEL_OF[a] };
  const f = FUNNEL_ALIAS[String(funnel ?? "").toLowerCase().replace(/[\s_-]*(of[\s_-]*)?(the[\s_-]*)?funnel\b/, "").trim()] ?? null;
  return { awareness: null, funnel: f };
}

// A short phrase naming the core insight; angles of one insight share it exactly, so they group together.
export const cleanInsight = (s: unknown) => {
  const t = String(s ?? "").replace(/\s+/g, " ").replace(/^["'“”‘’\s]+|["'“”‘’.\s]+$/g, "").trim();
  return t ? t.slice(0, 80) : null;
};

// "Problem-aware · Top of funnel", or as much of it as the piece has (older pieces have neither).
export const stageLine = (p: { awareness?: string | null; funnel?: string | null }) =>
  [STAGE_LABEL[p.awareness as Awareness], FUNNEL_LABEL[p.funnel as Funnel]].filter(Boolean).join(" · ");

// A reel with no camera footage: made by the animated reel editor from words (animated type, graphics and B-roll).
// Every reel from a standalone idea is one; the flag rides on the piece's media.
export const isAnimated = (p: { kind: string; media?: { animated?: boolean } | null; studio_episodes?: object | null }, episodeKind?: string | null) =>
  p.kind === "reel" && (!!p.media?.animated || (episodeKind ?? (p.studio_episodes as { kind?: string | null } | null | undefined)?.kind) === "idea");

// The training material a carousel or post is built out with (lib/moments.ts BUILD_OUT), for the writers and the builder.
export function brainNote(p: { moment?: { brain?: string[] } | null }) {
  const b = (p.moment?.brain ?? []).filter(Boolean);
  return b.length ? `Build it out with ${OWNER}'s training material in the brain: ${b.map((x) => `"${x}"`).join(", ")} (look them up with brain_search or brain_get_document). The moment is the spark; these give the steps, the frameworks and the client results.` : "";
}

// One line for the writers and the coach's review, so the post, the caption and the review serve the reader the piece
// was planned for. Empty for older pieces with no stage.
export function stageNote(p: { awareness?: string | null; insight?: string | null }) {
  const a = p.awareness as Awareness;
  if (!STAGE_LABEL[a]) return "";
  return `Built for the ${STAGE_LABEL[a].toLowerCase()} reader (${FUNNEL_LABEL[FUNNEL_OF[a]].toLowerCase()}): the reader ${STAGE_BRIEF[a]}${p.insight ? ` The core insight: ${p.insight}.` : ""}`;
}
