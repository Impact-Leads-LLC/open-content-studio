import { db, safeError } from "../../../lib/supabase";
import { actor } from "../../../lib/auth";
import { OWNER } from "../../../lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rules the owner adds from their reviews. Active rules go into every the coach review.
export async function GET() {
  try {
    const { data, error } = await db().from("studio_rules").select("*, studio_pieces(num, title)").order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ rules: data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { body } = await req.json();
    const me = actor(req);
    if (me?.role !== "owner") return Response.json({ error: `Only ${OWNER} can add a rule.` }, { status: 403 });
    const author = me.name;
    if (!body || typeof body !== "string") return Response.json({ error: "Write the rule first." }, { status: 400 });
    const { data, error } = await db().from("studio_rules").insert({ body: body.slice(0, 1000), author: String(author).slice(0, 40), status: "active" }).select().single();
    if (error) throw error;
    return Response.json({ rule: data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, status } = await req.json();
    if (actor(req)?.role !== "owner") return Response.json({ error: `Only ${OWNER} can change a rule.` }, { status: 403 });
    if (!["active", "off", "proposed"].includes(status)) return Response.json({ error: "Bad status." }, { status: 400 });
    const { data, error } = await db().from("studio_rules").update({ status }).eq("id", id).select().single();
    if (error) throw error;
    return Response.json({ rule: data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
