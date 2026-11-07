import { db, safeError } from "../../../../../lib/supabase";
import { revisePost, splitPost } from "../../../../../lib/skill";
import { revisionMaterial } from "../../../../../lib/coach";
import { withUrls, type Piece } from "../../../../../lib/pieces";
import { actor } from "../../../../../lib/auth";
import { COACH } from "../../../../../lib/brand";

export const runtime = "nodejs";
export const maxDuration = 300;

// "Fix it for me": rewrite the post with the coach's fixes, the owner's answers and the team's instruction.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { instruction = "" } = await req.json().catch(() => ({}));
    const author = actor(req)?.name ?? "Team";
    const sb = db();
    const { data, error } = await sb.from("studio_pieces").select("*").eq("id", id).single();
    if (error) throw error;
    const p = data as Piece;
    if (p.kind !== "post" || !p.body) return Response.json({ error: "Only written posts can be rewritten here." }, { status: 400 });
    const r = await revisePost(await revisionMaterial(p, String(instruction).slice(0, 1000)));
    const { body, note } = splitPost(r.text);
    const upd = await sb.from("studio_pieces").update({ body, review: null, status: "draft", updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (upd.error) throw upd.error;
    await sb.from("studio_notes").insert({ piece_id: id, author, kind: "fix", body: instruction ? `Rewrote it: ${instruction}` : `Rewrote it with ${COACH}'s fixes.`, meta: { previous: p.body, review: p.review } });
    if (note) await sb.from("studio_notes").insert({ piece_id: id, author: "Writer", kind: "note", body: note });
    const [piece] = await withUrls([upd.data as Piece]);
    return Response.json({ piece });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
