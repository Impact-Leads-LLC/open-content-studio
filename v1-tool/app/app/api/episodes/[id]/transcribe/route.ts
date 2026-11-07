import { db, storage, fileKind, safeError } from "../../../../../lib/supabase";
import { episodeFeeds, people } from "../../../../../lib/feeds";
import { startTranscribe } from "../../../../../lib/render";
import { TRACKS } from "../../../../../lib/transcript";

export const runtime = "nodejs";
export const maxDuration = 60;

// Transcribe the raw footage when the episode has no transcript, or only a rough one while it has camera feeds (a Word
// or text transcript has a time each turn or each minute, and can't always tell the people apart; each person's own
// track gives exact times). What gets transcribed: each person's own track from the camera feeds (their microphone
// file, else their camera file), else the full episode, else the biggest audio, then the biggest video, in the material
// (never a screen share: it has no sound). When it's done, the moments are found on their own, or the ones already
// found move to the new transcript's times (episode GET).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = db();
    const [{ data: ep, error }, { data: files }, { data: full }] = await Promise.all([
      sb.from("studio_episodes").select("id, transcribe").eq("id", id).single(),
      storage().list(`episodes/${id}`, { limit: 200, sortBy: { column: "created_at", order: "desc" } }),
      storage().list(`episodes/${id}/full`, { limit: 20, sortBy: { column: "created_at", order: "desc" } }),
    ]);
    if (error) throw error;
    if (ep.transcribe?.status === "running") return Response.json({ transcribe: ep.transcribe });
    const cams = people(await episodeFeeds(id)).filter((p) => p.audio || p.video);
    const texts = (files ?? []).filter((f) => f.id && fileKind(f.name) === "transcript").map((f) => f.name);
    const exact = texts.some((n) => TRACKS.test(n) || /\.(srt|vtt)$/i.test(n));
    if (texts.length && (exact || !cams.length)) return Response.json({ error: "This episode already has a transcript." }, { status: 400 });
    const footage = (full ?? []).find((f) => f.id && fileKind(f.name) === "clip");
    const size = (f: { metadata: unknown }) => (f.metadata as { size?: number } | null)?.size ?? 0;
    const material = (files ?? []).filter((f) => f.id && ["clip", "audio"].includes(fileKind(f.name)) && !/screen/i.test(f.name))
      .sort((a, b) => Number(fileKind(b.name) === "audio") - Number(fileKind(a.name) === "audio") || size(b) - size(a))[0];
    const sources = cams.length
      ? cams.map((p) => ({ who: p.person, path: (p.audio ?? p.video)!.path }))
      : footage ? [{ who: "Speaker", path: `episodes/${id}/full/${footage.name}` }]
      : material ? [{ who: "Speaker", path: `episodes/${id}/${material.name}` }] : [];
    if (!sources.length) return Response.json({ error: "Upload the video or audio first." }, { status: 400 });
    const ts = Date.now();
    const job = await startTranscribe(sources, `episodes/${id}/${ts}-${cams.length ? "camera-tracks-" : ""}transcript.txt`, `episodes/${id}/words/${ts}.json`);
    const transcribe = { status: "running", job, at: new Date().toISOString(), sources: sources.map((s) => s.who) };
    const upd = await sb.from("studio_episodes").update({ transcribe }).eq("id", id);
    if (upd.error) throw upd.error;
    return Response.json({ transcribe });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
