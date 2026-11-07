import { after } from "next/server";
import { safeError } from "../../../../../lib/supabase";
import { actor } from "../../../../../lib/auth";
import { LOOKS, pickThumb, refreshThumb, startRender, startWords, type Look } from "../../../../../lib/thumbnail";
import { OWNER } from "../../../../../lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Starting a cloud machine takes a few seconds; the ones that start on their own run after the response.
export const maxDuration = 300;

const later = (fn: () => Promise<unknown>) => after(() => fn().catch((e) => console.error("the thumbnail job didn't start:", safeError(e))));

// The episode's YouTube thumbnail (lib/thumbnail.ts, thumbnail-builder 3.0): the biggest takeaway, three word options,
// every look made for the option the owner chose (the call, the number wall, the board), the owner's pick.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json({ thumb: await refreshThumb(id, later) });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

// {action: "words"} writes the three options (again); {action: "render", option} makes every look of one option (the owner
// picks the words; the team can retry an option that was already made); {action: "pick", look, option} is the owner's pick.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const me = actor(req);
    if (body.action === "words") {
      await startWords(id, { notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : undefined });
    } else if (body.action === "render") {
      const n = Number(body.option);
      if (!Number.isInteger(n) || n < 1 || n > 3) return Response.json({ error: "Pick option 1, 2 or 3." }, { status: 400 });
      if (me?.role !== "owner") {
        const cur = await refreshThumb(id, later);
        if (!cur.renders.some((r) => r.option === n)) return Response.json({ error: `${OWNER} picks the words. Ask ${OWNER} which option to make.` }, { status: 403 });
      }
      await startRender(id, n);
    } else if (body.action === "pick") {
      if (me?.role !== "owner") return Response.json({ error: `Only ${OWNER} picks the thumbnail.` }, { status: 403 });
      if (!LOOKS.includes(body.look)) return Response.json({ error: "Pick the call, the number wall or the board." }, { status: 400 });
      await pickThumb(id, body.look as Look, Number.isInteger(body.option) ? body.option : undefined, me.name);
    } else {
      return Response.json({ error: "Unknown action." }, { status: 400 });
    }
    return Response.json({ thumb: await refreshThumb(id, later) });
  } catch (e) {
    if (e instanceof RangeError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
