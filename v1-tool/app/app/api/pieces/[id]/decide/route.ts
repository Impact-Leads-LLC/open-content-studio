import { db, safeError } from "../../../../../lib/supabase";
import { withUrls, type Piece } from "../../../../../lib/pieces";
import { actor } from "../../../../../lib/auth";
import { COACH, OWNER } from "../../../../../lib/brand";

export const runtime = "nodejs";

// Moves between the team and the owner: send (team to the owner), approve, send back, answer the coach's question, or drop the
// piece (the owner).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { decision, note = "", reasons = [], rule = false } = await req.json();
    // Only the owner's account approves, sends back, answers the coach or drops a piece; the team can send to the owner.
    const me = actor(req);
    if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
    if (decision !== "send" && me.role !== "owner") return Response.json({ error: `Only ${OWNER} can approve, send back, answer ${COACH} or drop a piece.` }, { status: 403 });
    const author = me.name;
    const sb = db();
    const { data, error } = await sb.from("studio_pieces").select("*").eq("id", id).single();
    if (error) throw error;
    const p = data as Piece;
    const meta = { coach_verdict: p.review?.verdict ?? null, score: p.review?.score ?? null, reasons, question: p.review?.question || null };
    const text = String(note).slice(0, 4000);
    let status = p.status, kind = "note", body = text;
    if (decision === "send") { status = "ready"; body = text ? `Sent to ${OWNER}: ${text}` : `Sent to ${OWNER}.`; }
    else if (decision === "approve") { status = p.scheduled_at ? "scheduled" : "approved"; kind = "approve"; body = text || "Approved."; }
    else if (decision === "sendback") {
      if (!text && !reasons.length) return Response.json({ error: "Say what to change." }, { status: 400 });
      status = "changes"; kind = "sendback"; body = [reasons.length ? `${reasons.join(", ")}.` : "", text].filter(Boolean).join(" ");
    } else if (decision === "answer") {
      if (!text) return Response.json({ error: "Write the answer first." }, { status: 400 });
      // A piece already in the owner's queue goes back to the team to work their answer in; a held piece stays where it is.
      if (p.status === "ready") status = "changes";
      kind = "answer";
    } else if (decision === "drop") {
      status = "skipped"; kind = "drop"; body = text ? `Dropped it: ${text}` : "Dropped it.";
    } else if (decision === "restore") {
      // Undo a drop: a piece that was made goes back to the team as a draft; an idea goes back on the board.
      if (p.status !== "skipped") return Response.json({ error: "This piece isn't off the board." }, { status: 400 });
      const made = !!(p.body || p.media?.video || p.media?.slides?.length);
      status = made ? "draft" : "concept"; body = "Brought it back.";
    } else return Response.json({ error: "Unknown decision." }, { status: 400 });

    const upd = await sb.from("studio_pieces").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (upd.error) throw upd.error;
    await sb.from("studio_notes").insert({ piece_id: id, author: String(author).slice(0, 40), kind, body, meta });
    // the owner's reason becomes a rule the coach applies from now on.
    if (rule && text && decision === "sendback") await sb.from("studio_rules").insert({ body: text, source_piece: id, status: "active", author: String(author).slice(0, 40) });
    const [piece] = await withUrls([upd.data as Piece]);
    return Response.json({ piece });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
