import { db, safeError } from "../../../../../lib/supabase";
import { actor } from "../../../../../lib/auth";
import { driveReady, nameFor, saveToDrive } from "../../../../../lib/drive";

export const runtime = "nodejs";
// a full episode's video goes up in pieces: give it time
export const maxDuration = 800;

// Whether Drive is connected, what the piece's files are called, and where they went.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!actor(req)) return Response.json({ error: "Sign in first." }, { status: 401 });
    const { id } = await params;
    const { data, error } = await db().from("studio_pieces").select("media").eq("id", id).single();
    if (error) throw error;
    return Response.json({ ready: driveReady(), name: await nameFor(id), drive: data?.media?.drive ?? null });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

// Save (or save again) a scheduled piece's files to Drive.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!actor(req)) return Response.json({ error: "Sign in first." }, { status: 401 });
    const { id } = await params;
    const { data, error } = await db().from("studio_pieces").select("status, media").eq("id", id).single();
    if (error) throw error;
    const scheduled = data.status === "posted" || (data.media?.cs?.mode === "scheduled" && data.media.cs.results?.some((r: { ok: boolean }) => r.ok));
    if (!scheduled) return Response.json({ error: "Only scheduled pieces go to Drive." }, { status: 400 });
    const drive = await saveToDrive(id);
    return drive.error ? Response.json({ error: drive.error, drive }, { status: 500 }) : Response.json({ drive });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
