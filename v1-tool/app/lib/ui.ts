import { OWNER, PALETTE } from "./brand";

// The app's colours, from the brand palette (brand/studio.json). The accent means "the owner has to act"; everything else
// is the primary colour, ink and white.
const mix = (a: string, b: string, t: number) => {
  const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
};
// dark text on a light accent, white on a dark one
const inkOn = (h: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? PALETTE.ink : "#ffffff"; };
export const C = { navy: PALETTE.primary, navy2: mix(PALETTE.primary, "#000000", 0.25), ink: PALETTE.ink, text: "#3a4651", muted: "#5f6b76", line: "#e4e9ee", hair: "rgba(12,26,36,0.14)", soft: "#f4f6f8", accent: PALETTE.accent, accentInk: inkOn(PALETTE.accent), deep: mix(PALETTE.primary, "#000000", 0.1), warn: "#9a3d0b", onNavy: mix(PALETTE.primary, "#ffffff", 0.6) };
export const HEAD = "'Libre Franklin', Arial, sans-serif";
const base = { minHeight: 44, padding: "0 18px", borderRadius: 6, fontFamily: HEAD, fontWeight: 700, fontSize: 14, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 } as const;
// The team's main action.
export const btn = { ...base, border: 0, background: C.navy, color: "#fff" } as const;
// The owner's decisions only: the hottest thing on screen.
export const hot = { ...base, minHeight: 52, padding: "0 28px", border: 0, background: C.accent, color: C.accentInk, fontSize: 16, boxShadow: `0 10px 24px ${C.accent}59` } as const;
export const ghost = { ...base, background: "#fff", color: C.ink, border: `1px solid ${C.hair}`, fontWeight: 600 } as const;
// Team links are ink and underlined: the accent is kept for what only the owner does.
export const link = { background: "none", border: 0, padding: 0, color: C.ink, font: `600 14px ${HEAD}`, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 } as const;
export const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 6 } as const;
export const label = { fontSize: 12, fontFamily: HEAD, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: C.muted };
export const input = { width: "100%", minHeight: 44, padding: "0 12px", border: "1px solid #8796a3", borderRadius: 6, font: "15px Poppins, Arial, sans-serif", background: "#fff", color: C.ink } as const;

type Tone = { label: string; bg: string; fg: string; border?: string };
export const chip = (s: Tone) => ({ display: "inline-flex", alignItems: "center", minHeight: 24, padding: "0 9px", borderRadius: 6, background: s.bg, color: s.fg, border: s.border ?? "1px solid transparent", font: `700 11px ${HEAD}`, letterSpacing: "0.02em", whiteSpace: "nowrap" as const });

export const KIND: Record<string, string> = { episode: "Episode", reel: "Reel", carousel: "Carousel", post: "LinkedIn post" };
// A reel with no camera footage says so wherever the piece is named (lib/stages.ts isAnimated).
export const kindName = (p: { kind: string }, animated = false) => (animated ? "Animated reel" : KIND[p.kind] ?? p.kind);
// The awareness stage and funnel position on a piece ("Problem-aware · Top of funnel"): quiet muted text, so it informs
// without competing with the status.
export const stageText = { fontSize: 12, fontFamily: HEAD, fontWeight: 600, color: C.muted, lineHeight: 1.35 } as const;
// Four groups, the same words and colours on the episode cards, the episode page and every piece.
// The accent stays for what the owner has to do: only "Waiting for <owner>" wears it.
export type Group = "unreviewed" | "edit" | "scheduled" | "killed";
export const GROUPS: { id: Group; label: string; color: string; border: string; bg: string }[] = [
  { id: "unreviewed", label: "Unreviewed", color: "#7a8794", border: "2px dashed #7a8794", bg: "#fff" },
  { id: "edit", label: "In edit", color: "#b87400", border: "2px solid #b87400", bg: "#fff" },
  { id: "scheduled", label: "Scheduled", color: "#198754", border: "2px solid #198754", bg: "#fff" },
  { id: "killed", label: "Killed", color: "#9aa5af", border: "2px solid #e9edf1", bg: "#e9edf1" },
];
export const groupOf = (status: string): Group =>
  status === "concept" ? "unreviewed" : status === "skipped" ? "killed" : status === "scheduled" || status === "posted" ? "scheduled" : "edit";
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<Group, (typeof GROUPS)[number]>;

// Where a piece stands inside its group, in the same plain words everywhere.
export const STATUS: Record<string, Tone> = {
  concept: { label: "Unreviewed", bg: "#fff", fg: C.ink, border: "1px dashed #7a8794" },
  kept: { label: "Not made", bg: "#fff", fg: C.ink, border: `1px solid ${C.hair}` },
  skipped: { label: "Killed", bg: "#e9edf1", fg: C.muted },
  making: { label: "Making…", bg: C.soft, fg: C.ink },
  draft: { label: "With the team", bg: "#fff", fg: C.ink, border: `1px solid ${C.hair}` },
  ready: { label: `Waiting for ${OWNER}`, bg: C.accent, fg: C.accentInk },
  changes: { label: "Sent back", bg: "#fff", fg: C.navy, border: `1.5px solid ${C.navy}` },
  approved: { label: "Needs a date", bg: "#fff", fg: C.navy, border: `1.5px solid ${C.navy}` },
  scheduled: { label: "Scheduled", bg: "#198754", fg: "#fff" },
  posted: { label: "Posted", bg: C.line, fg: C.ink },
};
export const VERDICT: Record<string, Tone> = {
  ready: { label: `Ready for ${OWNER}`, bg: C.accent, fg: C.accentInk, border: `1.5px solid ${C.accent}` },
  fix: { label: "Fix first", bg: "#fff", fg: C.navy, border: `1.5px solid ${C.navy}` },
  rethink: { label: "Rethink", bg: C.navy, fg: "#fff", border: "1.5px solid #fff" },
};
// The seven checks from the brain doc "Review Standard", in priority order.
export const CHECKS = [
  { id: "stop", label: "Stop test", q: "Does the first line give the reader a number and an outcome in their own words?" },
  { id: "owner", label: `${OWNER} test`, q: `Is there a sentence only ${OWNER} would say?` },
  { id: "truth", label: "Truth test", q: "Does every number and quote match the source, with its condition?" },
  { id: "person", label: "Right person", q: "Do names, credits and labels sit on the right person?" },
  { id: "fresh", label: "New each time", q: "One point, one proof, nothing repeated?" },
  { id: "door", label: "Door test", q: "Does it end on one next step that fits this reader?" },
  { id: "lint", label: "Lint", q: "Voice guardrails, banned phrases, no em dashes?" },
] as const;

// A coach suggestion about the written caption that goes out with a reel ("Caption, paragraph 2"), not the words
// burned into the video (those come with a time or say on screen).
export const isCaptionFix = (f: { where?: string }) => /caption/i.test(f.where ?? "") && !/\d\s*s\b|\d:\d\d|burn|on.?screen|video/i.test(f.where ?? "");
// The signed-in person (Nav reads /api/auth/me and keeps the name and role here for the rest of the page).
export const who = () => { try { return localStorage.getItem("studio-who") || "Team"; } catch { return "Team"; } };
export const isOwner = () => { try { return localStorage.getItem("studio-role") === "owner"; } catch { return false; } };
export const changed = () => { try { window.dispatchEvent(new Event("studio:changed")); } catch {} };
