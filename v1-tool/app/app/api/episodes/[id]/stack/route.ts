import { db, safeError } from "../../../../../lib/supabase";
import { episodeFeeds, pairInput } from "../../../../../lib/feeds";
import { startStackPreview } from "../../../../../lib/render";

export const runtime = "nodejs";
export const maxDuration = 60;

// Stack the whole episode small, for the trim player. Runs on a cloud machine for a few minutes.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const inp = pairInput(await episodeFeeds(id));
    if (!inp.top) return Response.json({ error: "Add at least one camera feed first." }, { status: 400 });
    const path = `episodes/${id}/stack/preview.mp4`;
    const job = await startStackPreview(inp, path);
    const stack = { status: "running", job, path, at: new Date().toISOString() };
    const { error } = await db().from("studio_episodes").update({ stack }).eq("id", id);
    if (error) throw error;
    return Response.json({ stack });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
