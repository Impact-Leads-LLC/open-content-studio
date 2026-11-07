import { safeError } from "../../../lib/supabase";
import { MAX_IDEA, createIdea, ideaTranscript } from "../../../lib/ideas";

export const runtime = "nodejs";

// Start a standalone idea from its raw transcript (pasted, or a .txt or Word file the browser read): an episode-like
// record with kind "idea", its text stored as the transcript in the episode's folder, where uploads go. Finding the
// pieces is the next call, /api/episodes/[id]/concepts, the same engine an episode uses.
export async function POST(req: Request) {
  try {
    const { title, text } = await req.json();
    const name = typeof title === "string" ? title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    if (!name) return Response.json({ error: "Give the idea a title." }, { status: 400 });
    if (typeof text !== "string" || !text.trim()) return Response.json({ error: "Paste the idea's text, or add a .txt or Word file." }, { status: 400 });
    if (text.length > MAX_IDEA) return Response.json({ error: "That's as long as an episode. Start it as a new episode instead." }, { status: 400 });
    if (!ideaTranscript(text)) return Response.json({ error: "No text found in the idea." }, { status: 400 });
    return Response.json({ episode: await createIdea(name, text) });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
