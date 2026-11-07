import { db, safeError } from "../../../../../lib/supabase";
import { makeCard } from "../../../../../lib/cards";
import type { Piece } from "../../../../../lib/pieces";

export const runtime = "nodejs";
export const maxDuration = 60;

// A text post's branded graphic: POST { line?, look? } makes it (or makes it again) and puts it on the post as its image.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as { line?: unknown; look?: unknown };
    const { data: p, error } = await db().from("studio_pieces").select("id, episode_id, num, kind, hook, body, media").eq("id", id).single();
    if (error) throw error;
    if (p.kind !== "post") return Response.json({ error: "Graphics are for text posts." }, { status: 400 });
    const line = typeof body.line === "string" ? body.line.slice(0, 160) : undefined;
    const look = typeof body.look === "string" ? body.look : undefined;
    return Response.json(await makeCard(p as Piece, { line, look }));
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
