import { db, safeError } from "../../../lib/supabase";
import { SHOW } from "../../../lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every episode with its pieces' statuses (the cards count them by group) and how much footage it keeps in storage.
export async function GET() {
  try {
    const sb = db();
    const [eps, st] = await Promise.all([
      sb.from("studio_episodes").select("id, title, guest, show, kind, created_at, archived_at, studio_pieces(status, kind)").order("created_at", { ascending: false }),
      sb.rpc("studio_storage_by_episode"),
    ]);
    if (eps.error) throw eps.error;
    const bytes = new Map(((st.data ?? []) as { episode_id: string; bytes: number }[]).map((r) => [r.episode_id, Number(r.bytes) || 0]));
    return Response.json({ episodes: (eps.data ?? []).map((e) => ({ ...e, bytes: bytes.get(e.id) ?? 0 })) });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, guest, show } = await req.json();
    if (!title) return Response.json({ error: "Give the episode a title." }, { status: 400 });
    // the show it belongs to: the one picked, else the first of brand/studio.json's shows
    const { data, error } = await db().from("studio_episodes").insert({ title, guest: guest || null, show: typeof show === "string" && show.trim() ? show.trim().slice(0, 120) : SHOW }).select().single();
    if (error) throw error;
    return Response.json({ episode: data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
