import { db, safeError } from "../../../../../lib/supabase";
import { writeOutline } from "../../../../../lib/skill";
import { transcriptFor } from "../../../../../lib/coach";
import { parseTranscript } from "../../../../../lib/transcript";
import { secs, clock } from "../../../../../lib/time";
import { withUrls, type Piece } from "../../../../../lib/pieces";
import { actor } from "../../../../../lib/auth";
import { OWNER_FULL } from "../../../../../lib/brand";

export const runtime = "nodejs";
export const maxDuration = 300;

// A carousel idea's slide plan, written from the episode around the moment (for ideas found before outlines existed,
// or a fresh plan on request).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = db();
    const { data, error } = await sb.from("studio_pieces").select("*, studio_episodes(title, guest, show)").eq("id", id).single();
    if (error) throw error;
    const p = data as Piece & { studio_episodes: { title: string; guest: string | null; show: string } };
    if (p.kind !== "carousel") return Response.json({ error: "Only carousels get a slide plan." }, { status: 400 });
    const ep = p.studio_episodes;
    const { lines } = parseTranscript(await transcriptFor(p.episode_id));
    const a = Number.isFinite(secs(p.source_time)) ? secs(p.source_time) : 0;
    const excerpt = lines.filter((l) => l.t >= a - 30 && l.t <= a + 480).map((l) => `${clock(l.t)} ${l.who}: ${l.text}`).join("\n").slice(0, 30000);
    const material = `Episode: ${ep.title} (${ep.show}). Guest: ${ep.guest ?? "none"}. Host: ${OWNER_FULL}.
Carousel #${p.num}: ${p.title}
Hook: ${p.hook ?? ""}
Why: ${p.why ?? ""}
${p.editor_notes ? `The team's notes: ${p.editor_notes}\n` : ""}
The transcript around the idea (starts at ${p.source_time}):
${excerpt}`;
    const r = await writeOutline(material);
    if (!r.outline) throw new Error("The planner didn't return a slide plan. Try again.");
    const upd = await sb.from("studio_pieces").update({ outline: r.outline, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (upd.error) throw upd.error;
    await sb.from("studio_notes").insert({ piece_id: id, author: actor(req)?.name ?? "Team", kind: "note", body: "Wrote the slide plan." });
    const [piece] = await withUrls([upd.data as Piece]);
    return Response.json({ piece });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
