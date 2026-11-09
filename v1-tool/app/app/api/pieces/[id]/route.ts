import { db, safeError } from "../../../../lib/supabase";
import { slotFor } from "../../../../lib/cadence";
import { cleanStage } from "../../../../lib/stages";
import { chosen } from "../../../../lib/platforms";
import { refresh, withUrls, type Piece } from "../../../../lib/pieces";
import { OWNER } from "../../../../lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// a finished render writes its caption and gets the coach's review after the response, which can take most of this
export const maxDuration = 800;

const EDITABLE = ["status", "scheduled_at", "channels", "body", "title", "hook", "caption", "captions", "lead_magnet_id", "editor_notes", "outline"] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data, error } = await db().from("studio_pieces").select("*").eq("id", id).single();
    if (error) throw error;
    const [piece] = await withUrls([await refresh(data as Piece)]);
    return Response.json({ piece });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    // Approval only happens in the owner's queue, so the team can move a piece among these states only.
    if ("status" in body && !["concept", "kept", "skipped", "draft"].includes(body.status)) return Response.json({ error: `Only ${OWNER} approves pieces, from the queue.` }, { status: 400 });
    const sb = db();
    const { data: cur, error: e1 } = await sb.from("studio_pieces").select("status, body, kind, scheduled_at, media, channels").eq("id", id).single();
    if (e1) throw e1;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of EDITABLE) if (k in body) patch[k] = body[k];
    // the awareness level the team gives a piece (one added by hand has none), and the funnel position it sets
    if ("awareness" in body) { const s = cleanStage(body.awareness, null); patch.awareness = s.awareness; patch.funnel = s.funnel; }
    // The Instagram collaborator invite to the guest, on unless someone turns it off for this piece (lib/guests.ts).
    if ("collab" in body) {
      const media = { ...(cur.media ?? {}) } as Record<string, unknown>;
      if (body.collab) delete media.no_collab; else media.no_collab = true;
      patch.media = media;
    }
    // An image attached to a text post (or taken off): it rides with the post, and Instagram, which can't take text
    // alone, comes on with it and goes off without it.
    if ("image" in body) {
      const image = typeof body.image === "string" && body.image.startsWith(`episodes/`) ? body.image : null;
      const media = { ...((patch.media as object) ?? cur.media ?? {}) } as Record<string, unknown>;
      if (image) media.image = image; else delete media.image;
      patch.media = media;
      if (cur.kind === "post" && !("channels" in body)) {
        const now = chosen("post", cur.channels, !!(cur.media as { image?: string } | null)?.image);
        patch.channels = image ? [...new Set([...now, "Instagram"])] : now.filter((c) => c !== "Instagram");
      }
    }
    // A kept idea takes the next open day for its kind on the calendar; one that goes back to an idea or is killed lets
    // its day go. A date someone sets by hand always wins.
    if (!("scheduled_at" in body)) {
      if (body.status === "kept" && !cur.scheduled_at) { const at = await slotFor(sb, cur.kind, id); if (at) patch.scheduled_at = at; }
      if ((body.status === "concept" || body.status === "skipped") && cur.scheduled_at) patch.scheduled_at = null;
    }
    // A post idea already comes written (lib/copy.ts), so keeping it makes it a draft, ready for the coach's review.
    if (body.status === "kept" && cur.kind === "post" && cur.body?.trim()) patch.status = "draft";
    // Edited text needs a fresh review before it goes back to the owner.
    if ("body" in body && body.body !== cur.body) { patch.review = null; if (cur.status === "ready") patch.status = "draft"; }
    if ("scheduled_at" in body) {
      if (cur.status === "approved" && body.scheduled_at) patch.status = "scheduled";
      if (cur.status === "scheduled" && !body.scheduled_at) patch.status = "approved";
    }
    const { data, error } = await sb.from("studio_pieces").update(patch).eq("id", id).select().single();
    if (error) throw error;
    const [piece] = await withUrls([data as Piece]);
    return Response.json({ piece });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
