import { db, safeError } from "../../../../../lib/supabase";
import { cutClip, stackClip } from "../../../../../lib/render";
import { episodeFeeds, pairInput } from "../../../../../lib/feeds";
import { withUrls, type Piece } from "../../../../../lib/pieces";
import { actor } from "../../../../../lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const stamp = (s: number) => `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, "0")}s`;
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

// Cut the reel's clip out of the episode, so nobody exports or uploads clips one by one: from the camera feeds,
// stacked to 9:16, when the episode has them; otherwise from an uploaded 9:16 full episode.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { source, start, end } = await req.json();
    const author = actor(req)?.name ?? "Team";
    const sb = db();
    const { data, error } = await sb.from("studio_pieces").select("*").eq("id", id).single();
    if (error) throw error;
    const p = data as Piece;
    if (p.kind !== "reel") return Response.json({ error: "Only reels are cut from the full episode." }, { status: 400 });
    const inp = pairInput(await episodeFeeds(p.episode_id));
    if (!inp.top && (typeof source !== "string" || !source.startsWith(`episodes/${p.episode_id}/full/`))) return Response.json({ error: "Add the camera feeds first." }, { status: 400 });
    const a = Number(start), b = Number(end);
    if (!(a >= 0) || !(b > a)) return Response.json({ error: "The end has to come after the start." }, { status: 400 });
    // 120 s of footage at most: the reel is cut down from it (a change that lets a thought finish can need more than 90)
    if (b - a < 3 || b - a > 120) return Response.json({ error: "Keep the clip between 3 and 120 seconds." }, { status: 400 });

    const out = `episodes/${p.episode_id}/${Date.now()}-cut-${p.num}-${stamp(a)}-${stamp(b)}.mp4`;
    const { width, height } = inp.top ? await stackClip(inp, out, a, b - a) : await cutClip(source, out, a, b - a);
    const media = { ...p.media, clip: out, cut: { source: inp.top ? "feeds" : source, start: a, end: b, width, height } };
    const upd = await sb.from("studio_pieces").update({ media, status: p.status === "concept" ? "kept" : p.status, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (upd.error) throw upd.error;
    await sb.from("studio_notes").insert({ piece_id: id, author: String(author).slice(0, 40), kind: "note", body: `Cut ${clock(a)} to ${clock(b)} (${(b - a).toFixed(1)} s) from the full episode.`, meta: { cut: media.cut } });
    const [piece] = await withUrls([upd.data as Piece]);
    return Response.json({ piece, clip: out, width, height });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
