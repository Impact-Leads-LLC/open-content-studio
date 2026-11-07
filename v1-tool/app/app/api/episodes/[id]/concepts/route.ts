import { after } from "next/server";
import { safeError } from "../../../../../lib/supabase";
import { addConcepts, claimRun, runConcepts } from "../../../../../lib/concepts";
import { copyRelay } from "../../../../../lib/copy";
import { actor } from "../../../../../lib/auth";

export const runtime = "nodejs";
// Two passes of the Moment Coach over a whole episode, each with the brain connected: five to ten minutes.
export const maxDuration = 800;

// The Moment Coach reads the transcript (plus the brand, through the connector) and puts its strongest picks on the board.
// It runs after the response, so a long look never hangs on the browser; the board shows it running and then what it
// found (studio_episodes.moments). ?dry=1 waits and returns the picks and the rejects without adding anything.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (new URL(req.url).searchParams.get("dry") === "1") return Response.json(await addConcepts(id, { dry: true }));
    if (!(await claimRun(id, actor(req)?.name ?? null))) return Response.json({ error: "The moments are already being found for this episode. The board fills in when that's done." }, { status: 409 });
    // every idea comes with its caption or post, written once the pieces are on the board
    const write = copyRelay(req);
    after(() => runConcepts(id, write).catch((e) => console.error("finding the moments failed:", String(e).slice(0, 200))));
    return Response.json({ started: true });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
