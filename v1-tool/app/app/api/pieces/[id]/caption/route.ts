import { safeError } from "../../../../../lib/supabase";
import { draftCaptions } from "../../../../../lib/captions";
import { withUrls } from "../../../../../lib/pieces";
import { actor } from "../../../../../lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

// "Write it for me": one caption for every network, drafted from what's said in the moment with the owner's LinkedIn skill and
// voice, then the coach's first look (the piece's lead magnet decides the call to action).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [piece] = await withUrls([await draftCaptions(id, actor(req)?.name ?? "Team")]);
    return Response.json({ piece });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
