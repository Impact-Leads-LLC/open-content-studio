import { safeError } from "../../../../../lib/supabase";
import { draftCopy } from "../../../../../lib/copy";

export const runtime = "nodejs";
// a post is written, reviewed by the coach and rewritten with their fixes: a few minutes
export const maxDuration = 800;

// Writes one piece's words on its own (lib/copy.ts): the post, or the caption for a reel or carousel.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json(await draftCopy(id));
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
