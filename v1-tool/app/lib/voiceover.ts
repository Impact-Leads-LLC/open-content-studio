import { db, storage } from "./supabase";
import { run } from "./skill";
import { animatedScript } from "./animated";
import { stageNote } from "./stages";
import type { Piece } from "./pieces";
import { BRAIN_TOOLS, COACH, DOC, OWNER, OWNER_FULL, BOOKING_OFFER } from "./brand";

// The owner's voiceover on an animated reel. A reel made without a script tends not to tell a useful story: a weak hook,
// an unclear point, and little reason to care. So the reel starts from a script with a real shape (hook, why it matters,
// the one point, proof, the ask), checked the way the coach would check it, then the owner reads it in the app and the
// animated reel editor times every beat to their voice.
// Lives on the piece as media.vo; the recording sits at pieces/<id>/vo/<ts>.<ext> in studio-media.

export type VoScript = { hook: string; lines: string[]; words: number; notes: string; checks?: { hook: string; point: string; why_care: string } };
export type Vo = { script?: VoScript; status?: "script" | "recorded"; audio?: string; seconds?: number; at?: string; by?: string; recorded_at?: string };

const str = { type: "string" };
const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const SCHEMA = obj({
  hooks: { type: "array", items: str },
  draft: { type: "array", items: str },
  checks: obj({ hook: str, point: str, why_care: str }),
  lines: { type: "array", items: str },
  notes: str,
});

const SYSTEM = `You write the voiceover script for one animated reel in ${OWNER_FULL}'s content studio. ${OWNER} reads it aloud
in their own voice; the reel shows animated type and brand graphics timed to the words. There is no camera footage, so
the script carries the whole reel.

${BRAIN_TOOLS} Start with get_brand_brief, then read the brain doc "${DOC.reels}" (brain_get_document). The brain wins
over anything here. The brain's "${DOC.review}" is how ${COACH} reviews: write to pass its checks.

Why this exists: a reel made without a script tends not to tell a useful story: the hook is weak, the point is unclear,
and there is little reason for someone to care. Fix all three.

The shape, in this order, one spoken sentence per line:
1. The hook, the first line, said in about two seconds (under 12 words). A number and an outcome in the viewer's own
   words, or a sharp claim that names their problem. Never a vague insider line that needs context to make sense.
2. Why it matters to the viewer: one or two lines on what it costs them now (time, money, missed chances) or what they
   get. This is the reason to care.
3. The point: the one idea, said plainly, once. A viewer should be able to repeat it after one listen.
4. The proof or the example: one concrete thing from the source (a number, a moment, what happened). Never invented.
5. The landing: the point in a new, short line, then the ask from the brand brief for the topic (by default
   ${BOOKING_OFFER}); say what the ask is for, in the viewer's terms.

Rules:
- 60 to 100 words in all (about 25 to 38 seconds at a normal speaking pace). Short sentences a person says out loud, contractions,
  plain words a 10-year-old follows. Each line under 18 words.
- Every number, story and claim comes from the source below or the brand brief, with its original condition and owner.
  Never invent a figure, a client, a result or a quote. Ideas from a guest belong to the guest: say so by name.
- ${OWNER}'s voice guardrails ("${DOC.guardrails}"): no em dashes, no hype, no manufactured sales lines, no "here's the thing", no rhetorical
  three-part lists for rhythm, no fake-casual filler.
- How to work: write three hook options (hooks), pick the strongest and draft the script (draft), then check it as
  ${COACH} would (checks: hook = would a scrolling viewer stop, and why; point = the point in one sentence, or what's
  muddy; why_care = the reason a viewer cares, or what's missing), fix what fails, and return the final script (lines).
- notes: one or two plain sentences for ${OWNER} on what the script does and anything to check before reading it.
Return only the JSON.`;

export async function writeScript(p: Piece, ep: { title: string; show: string; kind?: string | null }, notes?: string) {
  const script = await animatedScript(p, ep.kind === "idea");
  const m = (p.moment ?? {}) as { angle?: string; quote?: string; speaker?: string };
  const user = [
    `${ep.kind === "idea" ? `A standalone idea ${OWNER} recorded alone` : `From "${ep.title}" (${ep.show})`}.`,
    `Piece #${p.num}: ${p.title}`,
    p.hook ? `The team's working hook: ${p.hook}` : "",
    m.angle ? `The angle the Moment Coach saw: ${m.angle}` : "",
    p.insight ? `The core insight: ${p.insight}` : "",
    stageNote(p),
    p.why ? `Why it's on the board: ${p.why}` : "",
    p.outline ? `The outline:\n${p.outline}` : "",
    notes ? `${OWNER}'s notes for this script (follow them unless one breaks a brand rule, and say so in notes):\n${notes}` : "",
    script.length ? `The source (lines marked * are the piece's own stretch; the rest is context):\n${script.map((l) => `${l.in ? "*" : " "} ${l.who ? `${l.who}: ` : ""}${l.text}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  const r = await run(SYSTEM, user, SCHEMA);
  const j = (() => { try { return JSON.parse((r.last.match(/\{[\s\S]*\}/) ?? r.text.match(/\{[\s\S]*\}/) ?? ["{}"])[0]); } catch { return {}; } })();
  const lines = clean(j.lines);
  if (lines.length < 3) throw new Error("The script didn't come back. Try again.");
  const out: VoScript = { hook: lines[0], lines, words: count(lines), notes: tidy(j.notes, 600), checks: j.checks && typeof j.checks === "object" ? { hook: tidy(j.checks.hook, 300), point: tidy(j.checks.point, 300), why_care: tidy(j.checks.why_care, 300) } : undefined };
  return { script: out, usage: r.usage };
}

// One line per spoken sentence; no em dashes on screen or in the read.
const tidy = (v: unknown, max = 220) => String(v ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, max);
export const clean = (v: unknown) => (Array.isArray(v) ? v : String(v ?? "").split(/\n+/)).map((x) => tidy(x)).filter(Boolean).slice(0, 14);
export const count = (lines: string[]) => lines.join(" ").split(/\s+/).filter(Boolean).length;

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "video/mp4": "m4a" };
export const voPrefix = (id: string) => `pieces/${id}/vo/`;
export function voPath(id: string, type: string, name?: string) {
  const ext = EXT[type.split(";")[0].trim().toLowerCase()] ?? (name?.match(/\.(webm|ogg|m4a|mp3|wav|aac|mp4)$/i)?.[1].toLowerCase() ?? "webm");
  return `${voPrefix(id)}${Date.now()}.${ext}`;
}

// Read-modify-write of media.vo only, so a render finishing at the same moment keeps its keys.
export async function saveVo(id: string, fn: (vo: Vo) => Vo) {
  const sb = db();
  const { data, error } = await sb.from("studio_pieces").select("media").eq("id", id).single();
  if (error) throw error;
  const media = (data?.media ?? {}) as Record<string, unknown>;
  const vo = fn({ ...((media.vo ?? {}) as Vo) });
  const upd = await sb.from("studio_pieces").update({ media: { ...media, vo }, updated_at: new Date().toISOString() }).eq("id", id).select("media").single();
  if (upd.error) throw upd.error;
  return vo;
}

export async function voUrl(path?: string, secs = 3600) {
  if (!path) return null;
  const { data } = await storage().createSignedUrl(path, secs);
  return data?.signedUrl ?? null;
}
