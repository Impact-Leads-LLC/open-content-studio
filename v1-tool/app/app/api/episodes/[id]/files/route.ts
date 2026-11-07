import { storage, safeError } from "../../../../../lib/supabase";

export const runtime = "nodejs";

// Remove one uploaded file (a wrong upload, an old full episode, a clip that was cut badly). Only inside this episode.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { path } = await req.json();
    if (typeof path !== "string" || !path.startsWith(`episodes/${id}/`) || path.includes("..")) return Response.json({ error: "That file isn't part of this episode." }, { status: 400 });
    const { error } = await storage().remove([path]);
    if (error) throw error;
    return Response.json({ removed: path });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
