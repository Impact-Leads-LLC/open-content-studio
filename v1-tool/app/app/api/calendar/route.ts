import { db, safeError } from "../../../lib/supabase";
import { withUrls, type Piece } from "../../../lib/pieces";
import { CADENCE, ACTIVE } from "../../../lib/cadence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Everything with a date (plus its episode), what's waiting for the owner, and the whole pipeline in counts.
export async function GET() {
  try {
    const sb = db();
    const [dated, waiting, all] = await Promise.all([
      sb.from("studio_pieces").select("*, studio_episodes(title, guest, guest_handles, link, kind)").not("scheduled_at", "is", null).neq("status", "skipped").order("scheduled_at"),
      sb.from("studio_pieces").select("*, studio_episodes(title, guest, guest_handles, link, kind)").eq("status", "ready").is("scheduled_at", null),
      sb.from("studio_pieces").select("status, kind, scheduled_at"),
    ]);
    if (dated.error) throw dated.error;
    const pipeline: Record<string, number> = {};
    for (const r of all.data ?? []) pipeline[r.status] = (pipeline[r.status] ?? 0) + 1;
    // pieces on their way out with no date that the posting rhythm can place
    const undated = (all.data ?? []).filter((r) => !r.scheduled_at && ACTIVE.includes(r.status) && CADENCE[r.kind]).length;
    return Response.json({ pieces: await withUrls((dated.data ?? []) as Piece[]), waiting: await withUrls((waiting.data ?? []) as Piece[]), pipeline, undated });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
