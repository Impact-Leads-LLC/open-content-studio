import { pickTranscript } from "./transcript";
import { db, storage, safeError } from "./supabase";
import { findMoments, type Existing, type LeadMagnetRef, type RunReport } from "./moments";
import { FUNNEL_OF } from "./stages";
import { isBrainIdea } from "./ideas";

// One look at an episode at a time, kept on the episode (studio_episodes.moments) so the board can say it's running and,
// after, what it found, so the team can trust it did what it's meant to. A look still marked running after STALE was cut off, so the next click can start again.
// sources and why: for an idea gathered from the training material, the brain documents it came from and why that topic
export type MomentsRun = { status: "running" | "done" | "failed"; at: string; by?: string | null; done_at?: string; seconds?: number; error?: string; restaged?: number; report?: RunReport; sources?: string[]; why?: string };
const STALE = 20 * 60000;

export async function claimRun(id: string, by: string | null, extra: Pick<MomentsRun, "sources" | "why"> = {}) {
  const sb = db();
  const { data: ep, error } = await sb.from("studio_episodes").select("moments").eq("id", id).single();
  if (error) throw error;
  const cur = ep.moments as MomentsRun | null;
  if (cur?.status === "running" && Date.now() - Date.parse(cur.at) < STALE) return false;
  const run: MomentsRun = { status: "running", at: new Date().toISOString(), by, ...extra };
  // only if nobody claimed it since the read, so two clicks don't start two looks
  let q = sb.from("studio_episodes").update({ moments: run }).eq("id", id);
  q = cur ? q.filter("moments->>at", "eq", cur.at) : q.is("moments", null);
  const { data } = await q.select("id");
  return !!data?.length;
}

// The look, start to end: the pieces go on the board, the run is recorded (done or failed, with why), then `write` has
// their captions and posts written.
export async function runConcepts(id: string, write?: (ids: string[]) => Promise<void>) {
  const sb = db(), t0 = Date.now();
  const { data: ep } = await sb.from("studio_episodes").select("moments").eq("id", id).single();
  const base = (ep?.moments ?? { status: "running", at: new Date(t0).toISOString() }) as MomentsRun;
  const save = (m: Partial<MomentsRun>) => sb.from("studio_episodes").update({ moments: { ...base, ...m, done_at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000) } }).eq("id", id);
  try {
    const r = await addConcepts(id);
    if ("dry" in r) return r;
    await save({ status: "done", restaged: r.restaged, report: r.report });
    if (write && r.ids.length) await write(r.ids);
    return r;
  } catch (e) {
    await save({ status: "failed", error: safeError(e) });
    throw e;
  }
}

// Find the moments: the Moment Coach reads the transcript (plus the brand, through the connector), scores every candidate
// and puts the strongest on the board with their plan: reels with their start and end, carousels with a slide plan,
// text posts, each built for one of the five awareness levels (lib/stages.ts), in the per-episode mix (lib/moments.ts). Used by the button and, after an upload is
// transcribed, on its own. A standalone idea (kind "idea") gets the same engine, its reels animated and no full-episode
// piece. `dry` returns the picks without adding them, for a look first.
export async function addConcepts(id: string, opts: { dry?: boolean } = {}) {
  const sb = db();
  const { data: ep, error } = await sb.from("studio_episodes").select("*").eq("id", id).single();
  if (error) throw error;
  const idea = ep.kind === "idea";
  const { data: files } = await storage().list(`episodes/${id}`, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  const tx = pickTranscript((files ?? []).filter((f) => f.id));
  if (!tx) throw new Error(idea ? "This idea has no transcript. Start it again with its text." : "Upload the transcript first (.txt, .srt, .vtt or Word), or the video or audio to transcribe.");
  const dl = await storage().download(`episodes/${id}/${tx.name}`);
  if (dl.error || !dl.data) throw dl.error ?? new Error("Couldn't read the transcript.");

  const [existing, lms, rules] = await Promise.all([
    sb.from("studio_pieces").select("id, num, kind, title, hook, source_time, source_end, status, awareness, insight, moment").eq("episode_id", id),
    sb.from("studio_lead_magnets").select("id, name, keyword, offer").eq("active", true),
    sb.from("studio_rules").select("body").eq("status", "active").order("created_at"),
  ]);
  const found = await findMoments(await dl.data.text(), { ...ep, source: isBrainIdea(ep) ? "brain" : idea ? "idea" : "episode" }, { existing: (existing.data ?? []) as Existing[], leadMagnets: (lms.data ?? []) as LeadMagnetRef[], rules: (rules.data ?? []).map((r) => r.body) });
  if (opts.dry) return { dry: true, ...found };
  // the pieces made before the levels existed get the level the coach gave them
  for (const r of found.restaged) {
    const p = (existing.data ?? []).find((x) => x.num === r.num && !x.awareness);
    if (p) await sb.from("studio_pieces").update({ awareness: r.awareness, funnel: FUNNEL_OF[r.awareness] }).eq("id", p.id);
  }

  // the numbers as they are now: someone may have added a piece by hand during the run, and two pieces can't share one
  const { data: nums } = await sb.from("studio_pieces").select("num").eq("episode_id", id);
  let num = Math.max(0, ...(existing.data ?? []).map((p) => p.num), ...(nums ?? []).map((p) => p.num as number));
  const rows = [];
  // Every row carries the same keys: a bulk insert fills missing keys with null, not the column default (so media is
  // always given; {} is its default).
  // the full-episode piece comes first, even when someone added a piece by hand before the moments were found
  if (!idea && !(existing.data ?? []).some((p) => p.kind === "episode")) rows.push({ episode_id: id, num: ++num, kind: "episode", title: `${ep.title} (full episode)`, hook: null, source_time: "00:00", source_end: null, why: null, outline: null, editor_notes: null, lead_magnet_id: null, moment: null, awareness: null, funnel: null, insight: null, media: {}, status: "kept" });
  for (const p of found.picks) rows.push({ episode_id: id, num: ++num, kind: p.kind, title: p.title, hook: p.hook, source_time: p.source_time, source_end: p.source_end, why: p.why, outline: p.outline, editor_notes: p.editor_notes, lead_magnet_id: p.lead_magnet_id, moment: p.moment, awareness: p.awareness, funnel: p.funnel, insight: p.insight, media: p.animated ? { animated: true } : {}, status: "concept" });
  const restaged = found.restaged.length;
  if (!rows.length) return { added: 0, ids: [] as string[], picks: 0, rejected: found.rejected.length, gaps: found.gaps, candidates: found.candidates, usage: found.usage, restaged, report: found.report };
  const ins = await sb.from("studio_pieces").insert(rows).select("id");
  if (ins.error) throw ins.error;
  // the new pieces, so the caller can have their captions and posts written (lib/copy.ts)
  const ids = (ins.data ?? []).map((r) => r.id as string);
  // gaps: the levels the material couldn't fill for a kind (the mix in lib/moments.ts), so the team knows what's short
  return { added: rows.length, ids, picks: found.picks.length, rejected: found.rejected.length, gaps: found.gaps, candidates: found.candidates, usage: found.usage, restaged, report: found.report };
}
