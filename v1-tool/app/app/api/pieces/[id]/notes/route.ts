import { db, safeError } from "../../../../../lib/supabase";
import { actor } from "../../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data, error } = await db().from("studio_notes").select("*").eq("piece_id", id).order("created_at");
    if (error) throw error;
    return Response.json({ notes: data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { body } = await req.json();
    const author = actor(req)?.name;
    if (!body || typeof body !== "string") return Response.json({ error: "Write the note first." }, { status: 400 });
    const { data, error } = await db().from("studio_notes").insert({ piece_id: id, author: String(author || "Team").slice(0, 40), kind: "note", body: body.slice(0, 4000) }).select().single();
    if (error) throw error;
    return Response.json({ note: data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
