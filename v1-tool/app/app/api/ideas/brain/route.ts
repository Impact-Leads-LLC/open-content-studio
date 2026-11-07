import { after } from "next/server";
import { safeError } from "../../../../lib/supabase";
import { gatherFromBrain } from "../../../../lib/brainidea";
import { BRAIN_SHOW, createIdea } from "../../../../lib/ideas";
import { claimRun, runConcepts } from "../../../../lib/concepts";
import { copyRelay } from "../../../../lib/copy";
import { actor } from "../../../../lib/auth";

export const runtime = "nodejs";
// gathering the topic from the brain is a minute or two; the pieces are found after the response
export const maxDuration = 800;

// Fill from the training material: gather one topic from the brain as an idea, then find its carousels and posts in the
// background. { topic } is optional; without it Claude picks one that hasn't gone out lately.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const topic = typeof body?.topic === "string" ? body.topic.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const g = await gatherFromBrain(topic);
    const ep = await createIdea(g.title, g.text, BRAIN_SHOW);
    if (await claimRun(ep.id, actor(req)?.name ?? null, { sources: g.docs, why: g.why })) {
      const write = copyRelay(req);
      after(() => runConcepts(ep.id, write).catch((e) => console.error("finding the pieces from the training material failed:", String(e).slice(0, 200))));
    }
    return Response.json({ episode: ep, docs: g.docs, why: g.why });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: e instanceof RangeError ? 400 : 500 });
  }
}
