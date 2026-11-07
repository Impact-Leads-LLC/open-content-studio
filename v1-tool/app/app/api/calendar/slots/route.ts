import { db, safeError } from "../../../../lib/supabase";
import { CADENCE, ACTIVE, nextSlot, takenSlots, mark } from "../../../../lib/cadence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?kind=reel[&except=<piece id>]: the next open slot for that kind (for "move it to the next open day").
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const kind = u.searchParams.get("kind") ?? "";
    if (!CADENCE[kind]) return Response.json({ at: null });
    const at = nextSlot(kind, await takenSlots(db(), u.searchParams.get("except") ?? undefined));
    return Response.json({ at });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

// POST: every piece on its way out that has no date takes the next open slot for its kind, the most finished first.
const RANK = ["ready", "approved", "draft", "changes", "making", "kept"];
export async function POST() {
  try {
    const sb = db();
    const { data, error } = await sb.from("studio_pieces").select("id, num, kind, status, created_at").is("scheduled_at", null).in("status", ACTIVE).in("kind", Object.keys(CADENCE));
    if (error) throw error;
    const todo = (data ?? []).sort((a, b) => RANK.indexOf(a.status) - RANK.indexOf(b.status) || String(a.created_at).localeCompare(String(b.created_at)) || a.num - b.num);
    const taken = await takenSlots(sb);
    const placed: { id: string; num: number; kind: string; at: string }[] = [];
    for (const p of todo) {
      const at = nextSlot(p.kind, taken);
      if (!at) continue;
      const upd = await sb.from("studio_pieces").update({ scheduled_at: at, updated_at: new Date().toISOString() }).eq("id", p.id).is("scheduled_at", null);
      if (upd.error) throw upd.error;
      mark(taken, p.kind, at);
      placed.push({ id: p.id, num: p.num, kind: p.kind, at });
    }
    return Response.json({ placed });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
