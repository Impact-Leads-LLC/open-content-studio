import { db, safeError } from "../../../../../../lib/supabase";
import { startAudio, signedSource } from "../../../../../../lib/podcast-server";
import type { Episode } from "../../../../../../lib/podcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Prepare the episode's audio from a file in the studio: the episode's audio, its full episode video, or an upload.
export async function POST(req: Request, { params }: { params: Promise<{ pid: string }> }) {
  try {
    const { pid } = await params;
    const { source } = await req.json();
    const { data } = await db().from("studio_podcast_episodes").select("*").eq("id", pid).maybeSingle();
    const ep = data as Episode | null;
    if (!ep) return Response.json({ error: "No such episode." }, { status: 404 });
    if (ep.audio_job?.status === "running") return Response.json({ error: "The audio is already being prepared." }, { status: 409 });
    const ok = typeof source === "string" && !source.includes("..") && ((ep.episode_id && source.startsWith(`episodes/${ep.episode_id}/`)) || source.startsWith("uploads/"));
    if (!ok) return Response.json({ error: "Pick a file from this episode, or upload one." }, { status: 400 });
    const job = await startAudio([{ ep, src: await signedSource(source), name: source }], source);
    return Response.json({ job });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
