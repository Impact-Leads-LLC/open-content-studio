import Anthropic from "@anthropic-ai/sdk";
import type { Fix } from "./types";
import type { Line } from "./transcript";
import { MODEL, OWNER, OWNER_FULL } from "./brand";

// Changing a made reel without starting over: an approved concept shouldn't turn into a whole other reel. The edit plan
// the team liked goes back to the editor with the changes.

// What a change adds to the editor's context (EditContext in lib/render.ts): the edit the team liked (times in this
// clip's seconds) and what to change; start is where the clip begins in the episode, kept in the plan so the next
// change can line it up again. rules: the rules the owner added from their own reviews, for the coach's first look at the plan.
export type Revision = { previous?: Record<string, unknown>; change?: string; start?: number; rules?: string[] };

const TIMES = ["in", "out", "at", "until"];
// Move every time in an edit plan by `d` seconds, for a clip that now starts `d` seconds earlier (negative: later).
function shift(v: unknown, d: number): unknown {
  if (Array.isArray(v)) return v.map((x) => shift(x, d));
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, TIMES.includes(k) && typeof x === "number" ? Math.round((x + d) * 100) / 100 : shift(x, d)]));
}

// The parts of the last plan the editor decides (not what the builder or the app added), lined up with the new clip.
export function previousEdit(plan: Record<string, unknown>, d: number) {
  const keep = ["segments", "hook", "name", "graphics", "emphasis", "punches", "transitions", "vertigo", "ending", "keys", "fixes", "end"];
  const out = Object.fromEntries(keep.filter((k) => k in plan).map((k) => [k, shift(plan[k], d)]));
  if (Array.isArray(out.segments)) out.segments = (out.segments as Record<string, unknown>[]).map(({ id, ...s }) => s); // eslint-disable-line @typescript-eslint/no-unused-vars
  return out;
}

// Swap one line of a caption for another, ignoring differences in spacing and quote marks.
export function swap(text: string, before: string, after: string) {
  if (!before.trim()) return null;
  if (text.includes(before)) return text.replace(before, after);
  const esc = before.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/["“”]/g, `["“”]`).replace(/['‘’]/g, "['‘’]").replace(/\s+/g, "\\s+");
  const re = new RegExp(esc);
  return re.test(text) ? text.replace(re, after) : null;
}

// Apply a caption change to the written caption and to every network's own caption that carries the line.
export function swapCaptions(caption: string | null, captions: Record<string, string>, before: string, after: string) {
  let hit = false;
  const one = caption ? swap(caption, before, after) : null;
  if (one !== null) hit = true;
  const per = Object.fromEntries(Object.entries(captions).map(([k, v]) => {
    const s = v ? swap(v, before, after) : null;
    if (s !== null) hit = true;
    return [k, s ?? v];
  }));
  return { hit, caption: one ?? caption, captions: per };
}

export type ChangePlan = { start: number; end: number; clip: string; video: boolean; captions: { before: string; after: string }[]; reply: string };

const num = { type: "number" }, str = { type: "string" };
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["start", "end", "clip", "video", "captions", "reply"],
  properties: {
    start: num, end: num, clip: str, video: { type: "boolean" }, reply: str,
    captions: { type: "array", items: { type: "object", additionalProperties: false, required: ["before", "after"], properties: { before: str, after: str } } },
  },
};

const SYSTEM = `You help the team in ${OWNER_FULL}'s content studio change a reel that is already made and nearly right.
The editor keeps the approved edit and makes only the changes asked for. Your job is the part the editor can't do:
- start, end: the stretch of the episode the clip covers, in episode seconds. Keep the current values unless a change
  needs footage outside them ("let it run a couple of seconds longer", "let me finish my thought", "start earlier",
  "cut the first line" doesn't need it). To extend, find where that speaker's thought ends in the transcript and end
  about 1.5 seconds after that line starts its last words; transcript times are rough, so give a little extra rather
  than too little. Shortening is the editor's job: never move start later or end earlier. The clip stays 3 to 120 s
  (it's the footage the editor works from; the reel itself stays short).
- clip: when start or end moves, one plain sentence for the editor on what the extra footage holds (who says what);
  otherwise an empty string.
- video: true when any change is about the video (the cut, timing, graphics, on-screen words, captions burned
  into the video, the hook bar); false when every change is only about the written caption that goes out with it.
- captions: changes to the written caption, each as an exact line from the caption (before) and its replacement (after),
  in ${OWNER}'s voice with no em dashes. Only for changes about the written caption; otherwise an empty list.
- reply: one or two plain sentences to the person who asked, saying what will change (for example "It will run about
  3 seconds longer so ${OWNER} finishes the point, and the grid comes out. The rest of the edit stays."). No hype.
Never invent words anyone said. Answer with the JSON only.`;

// The most footage a clip can carry (the reel is cut down from it).
export const MAX_CLIP = 120;

// One short call, no brain: what the change means for the clip's range and the written caption.
export async function planChange(input: { changes: string; cut: { start: number; end: number }; reel: string; lines: Line[]; caption: string; used?: number }) {
  const { start, end } = input.cut;
  const near = input.lines.filter((l) => l.t >= start - 45 && l.t <= end + 75);
  const user = [
    `The changes the team asked for:\n${input.changes}`,
    `The clip covers ${start.toFixed(1)} to ${end.toFixed(1)} s of the episode (${(end - start).toFixed(1)} s).`,
    input.reel ? `What the reel uses now, in episode seconds:\n${input.reel}` : "",
    input.caption ? `The written caption:\n<<<\n${input.caption}\n>>>` : "The reel has no written caption yet.",
    `The episode transcript around the clip (episode seconds, rough):\n${near.map((l) => `${l.t.toFixed(1)} ${l.who}: ${l.text}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  const params = {
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg = await new Anthropic().messages.create(params as any);
  if (msg.stop_reason === "refusal") throw new Error("The model declined this change.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const raw = text.match(/\{[\s\S]*\}/);
  if (!raw) throw new Error("Couldn't read the change. Try again.");
  const r = JSON.parse(raw[0]) as ChangePlan;
  // never shorter than now (the editor trims); past the limit, unused footage before the reel's first moment goes first
  let a = Number.isFinite(r.start) ? Math.min(start, Math.max(0, r.start)) : start;
  let b = Number.isFinite(r.end) ? Math.max(end, r.end) : end;
  if (b - a > MAX_CLIP) a = Math.max(a, Math.min(b - MAX_CLIP, Number.isFinite(input.used) ? input.used! - 1 : Infinity));
  if (b - a > MAX_CLIP) b = a + MAX_CLIP;
  return { ...r, start: Math.round(a * 100) / 100, end: Math.round(b * 100) / 100, captions: Array.isArray(r.captions) ? r.captions : [] };
}

// The coach's suggestion, as a line the editor (or the planner) can act on.
export const fixLine = (f: Fix) => `${f.where ? `${f.where}: ` : ""}${f.problem}${f.before ? ` Now: "${f.before}".` : ""}${f.after ? ` Instead: "${f.after}".` : ""}`;
export { isCaptionFix } from "./ui";
