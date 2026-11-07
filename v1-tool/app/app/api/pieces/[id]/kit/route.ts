import { db, safeError } from "../../../../../lib/supabase";
import { postingKit } from "../../../../../lib/postkit";
import type { Piece } from "../../../../../lib/pieces";

export const runtime = "nodejs";

// The piece's posting kit (lib/postkit.ts): its files and each network's caption, for posting with another scheduler.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data, error } = await db().from("studio_pieces").select("*").eq("id", id).single();
    if (error) throw error;
    return Response.json(await postingKit(data as Piece));
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
