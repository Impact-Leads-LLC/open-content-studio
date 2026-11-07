import { db, safeError } from "../../../../lib/supabase";
import { writeClaimed } from "../../../../lib/copy";

export const runtime = "nodejs";
// four pieces at a time, each its own request; this one only hands them out, then passes on what's left
export const maxDuration = 800;

// Writes the words for pieces the app already claimed (lib/copy.ts), after the response: the relay that keeps captions
// and posts going after a long run, each request with its own time. Only claimed pieces, so it can't start new work.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids = (Array.isArray(body?.ids) ? body.ids : []).filter((x: unknown): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100);
    if (!ids.length) return Response.json({ error: "No pieces." }, { status: 400 });
    const { data } = await db().from("studio_pieces").select("id").in("id", ids).not("copy_since", "is", null);
    const claimed = (data ?? []).map((r) => r.id as string);
    if (claimed.length) writeClaimed(req, claimed);
    return Response.json({ writing: claimed.length });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
