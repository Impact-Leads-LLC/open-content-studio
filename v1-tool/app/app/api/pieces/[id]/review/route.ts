import { safeError } from "../../../../../lib/supabase";
import { reviewAndSave } from "../../../../../lib/coach";
import { withUrls } from "../../../../../lib/pieces";

export const runtime = "nodejs";
export const maxDuration = 300;

// the coach reviews the piece. A pass puts it in the owner's queue; anything else stays with the team.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [piece] = await withUrls([await reviewAndSave(id)]);
    return Response.json({ piece });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
