import { parseTranscript } from "./transcript";
import { db, storage } from "./supabase";
import { OWNER_FULL } from "./brand";

// A standalone idea: a raw transcript of an idea with no video (a voice note, a dictation, notes)
// goes in on its own and the content engine makes carousels, posts and animated reels from it. It's stored as an
// episode-like record (studio_episodes.kind = "idea") with its text as the transcript, so every step that reads an
// episode's transcript (the Moment Coach, captions, posts, the coach's truth test) reads it the same way.
export const IDEA_SHOW = "Standalone idea";
// An idea gathered from the owner's training material in the brain (lib/brainidea.ts): carousels and posts only, no reels
// (lib/moments.ts MIX.brain).
export const BRAIN_SHOW = "Training material";
export const isBrainIdea = (ep: { kind?: string | null; show?: string | null }) => ep.kind === "idea" && ep.show === BRAIN_SHOW;
const HOST = OWNER_FULL;
// A pasted idea is a few minutes of talking; anything this long is an episode and belongs in one.
export const MAX_IDEA = 120000;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const stamp = (t: number) => {
  const h = Math.floor(t / 3600), m = String(Math.floor((t % 3600) / 60)).padStart(2, "0"), s = (t % 60).toFixed(1).padStart(4, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
};

// The text in the shape the app reads (lib/transcript.ts): kept as it is when it's already a transcript the app can
// read (captions, or "Name (mm:ss)" turns that carry most of the words), otherwise each paragraph becomes one of
// the owner's turns, timed at 2.5 words a second (rough, like a Word transcript), so pieces can point to where they come from.
export function ideaTranscript(raw: string) {
  const text = raw.replace(/\r/g, "").replace(/ /g, " ").trim();
  if (!text) return "";
  const { lines } = parseTranscript(text);
  if (lines.length && (/-->/.test(text) || words(lines.map((l) => l.text).join(" ")) >= 0.6 * words(text))) return text;
  // paragraphs; notes with no blank lines between them go line by line
  let paras = text.split(/\n\s*\n/);
  if (paras.length === 1) paras = text.split("\n");
  paras = paras.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  let w = 0;
  return paras.map((p) => {
    const at = w / 2.5;
    w += words(p);
    return `${HOST} (${stamp(at)})\n${p}\n`;
  }).join("\n");
}

// Save an idea: an episode-like record (kind "idea") with its text stored as the transcript in the episode's folder,
// where uploads go. Finding its pieces is the next step, the same engine an episode uses.
export async function createIdea(title: string, text: string, show = IDEA_SHOW) {
  const name = title.replace(/\s+/g, " ").trim().slice(0, 200);
  const tx = ideaTranscript(text);
  if (!name || !tx) throw new RangeError(!name ? "Give the idea a title." : "No text found in the idea.");
  const sb = db();
  const { data: ep, error } = await sb.from("studio_episodes").insert({ title: name, guest: null, show, kind: "idea" }).select().single();
  if (error) throw error;
  const safe = `${name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "idea"}.txt`;
  const up = await storage().upload(`episodes/${ep.id}/${Date.now()}-${safe}`, new Blob([tx], { type: "text/plain" }), { contentType: "text/plain; charset=utf-8", upsert: false });
  if (up.error) {
    // nothing points at the record yet, so it goes rather than sit on the board with no text
    await sb.from("studio_episodes").delete().eq("id", ep.id);
    throw up.error;
  }
  return ep;
}
