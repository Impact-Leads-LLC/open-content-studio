import { after } from "next/server";
import { db, storage, safeError } from "../../../../../lib/supabase";
import { withUrls, type Piece } from "../../../../../lib/pieces";
import { actor } from "../../../../../lib/auth";
import { reviewQuietly, transcriptFor } from "../../../../../lib/coach";
import { parseTranscript } from "../../../../../lib/transcript";
import { fixLine, isCaptionFix, planChange, swapCaptions } from "../../../../../lib/revise";
import type { Fix } from "../../../../../lib/types";
import { COACH } from "../../../../../lib/brand";

export const runtime = "nodejs";
// the change itself is quick; the coach's review after it runs after the response, a few minutes with the brain
export const maxDuration = 300;

const MADE = ["draft", "changes", "ready", "approved", "scheduled"];
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

// Change a made reel without starting over: the the coach suggestions the team chose to apply, and/or their own
// note. Caption changes are made here and now. For the video, this works out whether the clip needs more of the
// episode and hands back what the editor should change; the page then cuts the longer clip (when it needs one) and
// starts the revision, which keeps the approved edit and changes only what was asked.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = actor(req);
    if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const ints = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : []);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 3000) : "";
    const sb = db();
    const { data, error } = await sb.from("studio_pieces").select("*").eq("id", id).single();
    if (error) throw error;
    const p = data as Piece;
    if (p.kind !== "reel") return Response.json({ error: "Only reels change this way." }, { status: 400 });
    if (p.status === "making") return Response.json({ error: "A new version is already being made. Wait for it to land." }, { status: 400 });
    if (!MADE.includes(p.status) || !p.media?.video) return Response.json({ error: "Make the reel first." }, { status: 400 });
    const fixes = p.review?.fixes ?? [];
    const chosen = ints(body.apply).map((i) => fixes[i]).filter(Boolean) as Fix[];
    const dropped = ints(body.skip).map((i) => fixes[i]).filter(Boolean) as Fix[];
    if (!chosen.length && !note && !dropped.length) return Response.json({ error: "Pick a suggestion or write what to change." }, { status: 400 });

    // the coach's caption lines go straight in; anything that doesn't match the caption word for word goes to the planner.
    let caption = p.caption ?? null, captions: Record<string, string> = { ...(p.captions ?? {}) }, capChanged = false;
    const unplaced: Fix[] = [];
    for (const f of chosen.filter(isCaptionFix)) {
      const r = swapCaptions(caption, captions, f.before, f.after);
      if (r.hit) ({ caption, captions } = r), capChanged = true; else unplaced.push(f);
    }
    const video = chosen.filter((f) => !isCaptionFix(f));
    const asks = [...video.map((f) => `${COACH}: ${fixLine(f)}`), ...unplaced.map((f) => `${COACH} (caption): ${fixLine(f)}`), note ? `The team: ${note}` : ""].filter(Boolean);

    // What the change means for the clip and the caption: one short call with the transcript around the clip.
    const cut = p.media.cut;
    let plan: Awaited<ReturnType<typeof planChange>> | null = null;
    if (asks.length) {
      const plFile = p.media.plan ? await storage().download(p.media.plan) : null;
      const pl = plFile?.data ? JSON.parse(await plFile.data.text()) : null;
      const at = Number.isFinite(pl?.clip_start) ? Number(pl.clip_start) : cut?.start ?? 0;
      const reel = (pl?.segments ?? []).map((s: { in: number; out: number; text: string }) => `${(at + s.in).toFixed(1)} to ${(at + s.out).toFixed(1)}: ${s.text}`).join("\n");
      const { lines } = parseTranscript(await transcriptFor(p.episode_id));
      const capText = [caption ?? "", ...Object.entries(captions).filter(([, v]) => v && v !== caption).map(([k, v]) => `[${k}] ${v}`)].filter(Boolean).join("\n\n");
      const used = pl?.segments?.length ? at + Number(pl.segments[0].in) : undefined;
      plan = await planChange({ changes: asks.join("\n"), cut: cut ?? { start: 0, end: 0 }, reel, lines, caption: capText, used });
      for (const c of plan.captions) {
        const r = swapCaptions(caption, captions, c.before, c.after);
        if (r.hit) ({ caption, captions } = r), capChanged = true;
      }
    }
    const longer = !!cut && !!plan && (plan.start < cut.start - 0.05 || plan.end > cut.end + 0.05);
    const render = !!plan && (plan.video || video.length > 0 || longer);

    // The record: what was asked, what the coach suggested that the team chose not to do (so they doesn't ask again).
    const asked = [...chosen.map((f) => f.problem), note].filter(Boolean);
    const summary = [asked.length ? `Asked for: ${asked.join(" ")}` : "", dropped.length ? `Left out ${dropped.length} of ${COACH}'s suggestions.` : ""].filter(Boolean).join(" ");
    await sb.from("studio_notes").insert({ piece_id: id, author: me.name, kind: "fix", body: summary.slice(0, 1500), meta: { review: p.review, applied: chosen, skipped: dropped, note, reel: true } });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (capChanged) Object.assign(patch, { caption, captions });
    // Nothing to render: the coach looks again at what changed (the caption, or the suggestions left out).
    if (!render) Object.assign(patch, { review: null, status: p.status === "ready" ? "draft" : p.status, media: { ...p.media, reviewing_since: new Date().toISOString() } });
    const upd = await sb.from("studio_pieces").update(patch).eq("id", id).select().single();
    if (upd.error) throw upd.error;
    if (!render) after(() => reviewQuietly(id, "after the change").then(() => undefined));
    const [piece] = await withUrls([upd.data as Piece]);
    const change = [
      ...asks,
      longer ? `The clip now runs ${clock(plan!.start)} to ${clock(plan!.end)} of the episode (it was ${clock(cut!.start)} to ${clock(cut!.end)}). ${plan!.clip}`.trim() : "",
    ].filter(Boolean).join("\n");
    return Response.json({
      piece,
      reply: plan?.reply || (capChanged ? `The caption is changed. ${COACH} is looking at it again.` : `Noted. ${COACH} is looking at it again.`),
      render: render ? { change, from: cut?.start ?? null, cut: longer ? { source: cut!.source, start: plan!.start, end: plan!.end } : null } : null,
    });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
