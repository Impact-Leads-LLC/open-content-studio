import { db, safeError } from "../../../../../lib/supabase";
import { actor } from "../../../../../lib/auth";
import { NAME } from "../../../../../lib/scheduler";
import { OWNER } from "../../../../../lib/brand";

export const runtime = "nodejs";

// "Scheduled it in <tool>": a piece posted through another scheduler by hand is marked scheduled here, so the calendar
// shows it and the cleanup clears its files a week after its date (RETENTION.md). { undo: true } takes the mark back.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = actor(req);
    if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const sb = db();
    const { data: p, error } = await sb.from("studio_pieces").select("id, status, media, scheduled_at").eq("id", id).single();
    if (error) throw error;
    const media = { ...(p.media ?? {}) } as Record<string, unknown>;
    if (body?.undo) {
      delete media.handoff;
      const upd = await sb.from("studio_pieces").update({ media, status: p.status === "scheduled" ? "approved" : p.status, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (upd.error) throw upd.error;
      await sb.from("studio_notes").insert({ piece_id: id, author: me.name, kind: "note", body: `Took back "scheduled in ${NAME}".` });
      return Response.json({ piece: upd.data });
    }
    if (!["approved", "scheduled"].includes(p.status)) return Response.json({ error: `${OWNER} approves it first.` }, { status: 400 });
    if (!p.scheduled_at) return Response.json({ error: "Give it a date first, the one you scheduled it for." }, { status: 400 });
    media.handoff = { at: new Date().toISOString(), by: me.name, tool: NAME };
    const upd = await sb.from("studio_pieces").update({ media, status: "scheduled", updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (upd.error) throw upd.error;
    await sb.from("studio_notes").insert({ piece_id: id, author: me.name, kind: "note", body: `Scheduled in ${NAME} by hand.` });
    return Response.json({ piece: upd.data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
