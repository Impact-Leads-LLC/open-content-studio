import { db, safeError } from "../../../../../../lib/supabase";
import { studioTranscript, writeShowNotes } from "../../../../../../lib/podcast-server";
import type { Episode } from "../../../../../../lib/podcast";
import { OWNER, OWNER_FULL } from "../../../../../../lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Draft the summary and show notes from the studio episode's transcript. Nothing is saved: the page fills the fields
// and the team edits before it saves.
export async function POST(_req: Request, { params }: { params: Promise<{ pid: string }> }) {
  try {
    const { pid } = await params;
    const { data } = await db().from("studio_podcast_episodes").select("*").eq("id", pid).maybeSingle();
    const ep = data as Episode | null;
    if (!ep) return Response.json({ error: "No such episode." }, { status: 404 });
    if (!ep.episode_id) return Response.json({ error: "This episode has no studio transcript to work from." }, { status: 400 });
    const transcript = await studioTranscript(ep.episode_id);
    if (!transcript) return Response.json({ error: "Add the episode's transcript to its files first." }, { status: 400 });
    const { data: show } = await db().from("studio_podcast_shows").select("title").eq("id", ep.show_id).maybeSingle();
    const material = `Show: ${show?.title ?? `${OWNER_FULL}'s podcast`}\nEpisode title: ${ep.title}\nGuest: ${ep.guest ?? `none (${OWNER} solo)`}${ep.guest_url ? ` (${ep.guest_url})` : ""}\n\nTranscript:\n${transcript.slice(0, 120000)}`;
    const out = await writeShowNotes(material);
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
