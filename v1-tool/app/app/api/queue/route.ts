import { db, safeError } from "../../../lib/supabase";
import { withUrls, type Piece } from "../../../lib/pieces";
import { openQuestions } from "../../../lib/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// the owner's queue: pieces the coach passed (or the team sent anyway), best first, the questions only the owner can answer,
// and how often the coach agreed with the owner.
export async function GET(req: Request) {
  try {
    const sb = db();
    if (new URL(req.url).searchParams.get("count")) {
      const [{ count, error }, asks] = await Promise.all([
        sb.from("studio_pieces").select("id", { count: "exact", head: true }).eq("status", "ready"),
        openQuestions(),
      ]);
      if (error) throw error;
      return Response.json({ waiting: count ?? 0, questions: asks.length });
    }
    const [ready, held, decisions, questions] = await Promise.all([
      sb.from("studio_pieces").select("*, studio_episodes(title, guest, guest_handles, link, kind)").eq("status", "ready"),
      sb.from("studio_pieces").select("id, num, kind, title, status, review, episode_id, awareness, funnel").in("status", ["draft", "changes"]),
      sb.from("studio_notes").select("kind, meta").in("kind", ["approve", "sendback"]),
      openQuestions(true),
    ]);
    if (ready.error) throw ready.error;
    const score = (p: Piece) => p.review?.score ?? -1;
    const pieces = await withUrls(((ready.data ?? []) as Piece[]).sort((a, b) => score(b) - score(a)));
    const judged = (decisions.data ?? []).filter((d) => d.meta?.coach_verdict);
    const agree = judged.filter((d) => (d.kind === "approve") === (d.meta.coach_verdict === "ready")).length;
    return Response.json({ pieces, held: held.data ?? [], questions, stats: { agree, total: judged.length } });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
