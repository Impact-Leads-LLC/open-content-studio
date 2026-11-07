import { safeError } from "../../../../../lib/supabase";
import { produceEpisode } from "../../../../../lib/produce";
import { secs } from "../../../../../lib/time";

export const runtime = "nodejs";
export const maxDuration = 60;

// Make the produced full episode now (lib/produce.ts). Body: start and end ("12:30" or seconds on the recording's
// clock), both optional; notes for the editor, optional (they stay on the episode for the next run).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const when = (v: unknown, what: string) => {
      if (v == null || String(v).trim() === "") return undefined;
      const t = secs(String(v));
      if (!Number.isFinite(t) || t < 0) throw new RangeError(`The ${what} time doesn't look right. Use minutes and seconds, like 1:05.`);
      return t;
    };
    const start = when(body.start, "start"), end = when(body.end, "end");
    if (start != null && end != null && end - start < 10) return Response.json({ error: "The end has to be at least 10 seconds after the start." }, { status: 400 });
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : undefined;
    const full_edit = await produceEpisode(id, { start, end, notes });
    return Response.json({ full_edit });
  } catch (e) {
    if (e instanceof RangeError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
