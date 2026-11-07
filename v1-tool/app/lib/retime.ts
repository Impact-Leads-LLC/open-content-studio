import { db, storage } from "./supabase";
import { parseTranscript, pickTranscript, TRACKS, type Line } from "./transcript";
import { secs } from "./time";

// When the camera tracks' transcript lands on an episode whose moments were found in a rough one (a Word transcript
// has a time each minute or so, so a moment can sit a minute and a half from its words), each moment moves to where its
// words really are. Moments already cut from the video keep their cut (those times came from the player, not the text).

type W = { w: string; t: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const stamp = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// every word with a time, spread through its line (no slower than 1.5 words a second, so a pause doesn't stretch it)
export function timedWords(lines: Line[]): W[] {
  const out: W[] = [];
  lines.forEach((l, i) => {
    const ws = l.text.split(/\s+/).map(norm).filter(Boolean);
    const next = lines[i + 1]?.t;
    const span = next !== undefined && next > l.t ? Math.min(next - l.t, ws.length / 1.5) : ws.length / 2.5;
    ws.forEach((w, k) => out.push({ w, t: l.t + (k / ws.length) * span }));
  });
  return out;
}

// Where a run of words (the moment in the old transcript) is in the new one: three-word matches, the densest cluster
// of them, then its first and last match stretched to the run's ends at speaking pace (the other person's words can sit
// in between, so counting words back would land in theirs). Null when too little matches to be sure.
export function align(win: string[], all: W[]): [number, number] | null {
  if (win.length < 6 || all.length < 3) return null;
  const at = new Map<string, number[]>();
  for (let i = 0; i + 2 < all.length; i++) {
    const k = `${all[i].w} ${all[i + 1].w} ${all[i + 2].w}`;
    const v = at.get(k);
    if (v) v.push(i); else at.set(k, [i]);
  }
  const hits: { j: number; i: number }[] = [];
  for (let j = 0; j + 2 < win.length; j++) for (const i of at.get(`${win[j]} ${win[j + 1]} ${win[j + 2]}`) ?? []) hits.push({ j, i });
  if (!hits.length) return null;
  hits.sort((a, b) => a.i - b.i);
  const span = Math.round(win.length * 2.5) + 60;
  let best = { n: 0, lo: 0, hi: 0 };
  for (let lo = 0, hi = 0; lo < hits.length; lo++) {
    while (hi < hits.length && hits[hi].i - hits[lo].i <= span) hi++;
    const n = new Set(hits.slice(lo, hi).map((h) => h.j)).size;
    if (n > best.n) best = { n, lo, hi };
  }
  if (best.n < Math.max(3, Math.floor(win.length / 12))) return null;
  const c = hits.slice(best.lo, best.hi);
  const first = c.reduce((a, b) => (b.j < a.j || (b.j === a.j && b.i < a.i) ? b : a));
  const last = c.reduce((a, b) => (b.j > a.j || (b.j === a.j && b.i > a.i) ? b : a));
  const e = Math.min(all.length - 1, last.i + 2);
  return [Math.max(0, all[first.i].t - first.j / 2.5), (all[e + 1]?.t ?? all[e].t + 0.5) + Math.max(0, win.length - 1 - (last.j + 2)) / 2.5];
}

async function read(id: string, name: string) {
  const r = await storage().download(`episodes/${id}/${name}`);
  return r.data ? parseTranscript(await r.data.text()).lines : [];
}

export async function retimeMoments(id: string) {
  const sb = db();
  const { data: files } = await storage().list(`episodes/${id}`, { limit: 200 });
  const all = (files ?? []).filter((f) => f.id);
  const tracks = all.filter((f) => TRACKS.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  const now = tracks.pop();
  const was = tracks.pop() ?? pickTranscript(all.filter((f) => !TRACKS.test(f.name)));
  if (!now || !was) return { moved: 0 };
  const [oldLines, newLines] = await Promise.all([read(id, was.name), read(id, now.name)]);
  const oldWords = timedWords(oldLines), newWords = timedWords(newLines);
  const { data: pcs } = await sb.from("studio_pieces").select("id, num, kind, source_time, source_end, media").eq("episode_id", id).neq("kind", "episode");
  let moved = 0;
  for (const p of pcs ?? []) {
    const a = secs(p.source_time);
    // already cut from the video, or its times set by hand from the audio: those are right already
    const m = p.media as { cut?: unknown; timed?: boolean } | null;
    if (!Number.isFinite(a) || m?.cut || m?.timed) continue;
    const e = secs(p.source_end);
    const b = Number.isFinite(e) && e > a ? e : a + 45;
    const got = align(oldWords.filter((w) => w.t >= a && w.t < b).map((w) => w.w), newWords);
    if (!got || (Math.abs(got[0] - a) < 1 && Math.abs(got[1] - b) < 1)) continue;
    const [na, nb] = [got[0], Math.max(got[1], got[0] + 3)];
    const upd: Record<string, string> = { source_time: stamp(na) };
    if (Number.isFinite(e) && e > a) upd.source_end = stamp(Math.ceil(nb));
    const { error } = await sb.from("studio_pieces").update(upd).eq("id", p.id);
    if (error) continue;
    moved++;
    await sb.from("studio_notes").insert({ piece_id: p.id, author: "Studio", kind: "note", body: `Moved to ${upd.source_time}${upd.source_end ? ` to ${upd.source_end}` : ""} to match the camera tracks' transcript (it was at ${p.source_time}${upd.source_end ? ` to ${p.source_end}` : ""} in the first transcript).` });
  }
  return { moved };
}
