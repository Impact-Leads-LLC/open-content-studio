import { db, storage, safeError } from "../../../../../lib/supabase";
import { startCarousel, startEdit, type CarouselContext, type EditContext } from "../../../../../lib/render";
import { secs } from "../../../../../lib/time";
import { transcriptFor } from "../../../../../lib/coach";
import { writePostFor } from "../../../../../lib/posts";
import { hasCopy, queueCopy } from "../../../../../lib/copy";
import { parseTranscript } from "../../../../../lib/transcript";
import { episodeFeeds, isHost, people, stackPair } from "../../../../../lib/feeds";
import { withUrls, type Piece } from "../../../../../lib/pieces";
import { previousEdit, type Revision } from "../../../../../lib/revise";
import { shotsPath } from "../../../../../lib/render";
import { isAnimated } from "../../../../../lib/stages";
import { activeRules, previousBeats, startAnimated } from "../../../../../lib/animated";
import { startCarouselBuild } from "../../../../../lib/carousels";
import { OWNER_FULL } from "../../../../../lib/brand";

export const runtime = "nodejs";
export const maxDuration = 300;

type Side = "top" | "bottom";
// Who is talking when, on the recording's clock, from the full-episode edit's shots (measured from each person's voice).
// For transcripts that can't tell the two people apart, like a Word transcript that labels every line "the owner". Shots of
// both people are left out, so a run lasts until the other person is on screen alone.
async function speakerRuns(episodeId: string): Promise<{ t: number; side: Side }[]> {
  const { data } = await db().from("studio_episodes").select("full_edit").eq("id", episodeId).single();
  const ed = data?.full_edit as { status?: string; job?: string } | null;
  if (ed?.status !== "ready" || !ed.job) return [];
  const f = await storage().download(shotsPath(ed.job));
  if (!f.data) return [];
  const j = JSON.parse(await f.data.text()) as { start?: number; cuts?: [number, string][] };
  const out: { t: number; side: Side }[] = [];
  for (const [t, s] of j.cuts ?? []) {
    if (s !== "top" && s !== "bot") continue;
    const side: Side = s === "top" ? "top" : "bottom";
    if (out[out.length - 1]?.side !== side) out.push({ t: (j.start ?? 0) + t, side });
  }
  return out;
}

// Make the piece: a post with the LinkedIn skill, a reel on a cloud machine (an animated reel, with no camera footage,
// on the animated reel editor), a carousel built on a cloud machine with the owner's carousel skill (or put together from
// slide images someone uploaded).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const opts = await req.json().catch(() => ({}));
    const sb = db();
    const { data, error } = await sb.from("studio_pieces").select("*, studio_episodes(title, guest, show, kind)").eq("id", id).single();
    if (error) throw error;
    const p = data as Piece & { studio_episodes: { title: string; guest: string | null; show: string; kind?: string | null } };
    const { kind: epKind, ...ep } = p.studio_episodes;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), review: null };

    if (p.kind === "post") {
      const r = await writePostFor(p, ep, "draft");
      // re-read: writing the post made its graphic, which the copy read above doesn't have
      const { data: cur } = await sb.from("studio_pieces").select("media").eq("id", id).single();
      Object.assign(patch, { body: r.body, status: "draft", media: { ...((cur?.media as object) ?? p.media), usage: r.usage } });
    } else if (p.kind === "reel" && isAnimated(p, epKind)) {
      // An animated reel: nothing to cut; the animated reel editor makes it from the piece's words (lib/animated.ts).
      // A change keeps the beats the team liked and changes only what's asked.
      const change = typeof opts.revise?.change === "string" ? opts.revise.change.trim().slice(0, 6000) : "";
      const notes = change ? "" : typeof opts.notes === "string" ? opts.notes.trim().slice(0, 4000) : (p.editor_notes ?? "");
      if (!change) patch.editor_notes = notes || null;
      const previous = change ? await previousBeats(p.media?.plan) : null;
      if (change && !previous) return Response.json({ error: "The last edit's plan is missing, so it can't be changed. Make the reel again." }, { status: 400 });
      let renderId: string;
      try {
        renderId = await startAnimated(p, { ...ep, kind: epKind }, { notes, change, previous: previous ?? undefined, rules: await activeRules() });
      } catch (e) {
        if (e instanceof RangeError) return Response.json({ error: e.message }, { status: 400 });
        throw e;
      }
      if (change) delete patch.review;
      const changing = change ? { reply: String(opts.revise.reply ?? "").slice(0, 400), at: new Date().toISOString() } : undefined;
      Object.assign(patch, { status: "making", media: { ...p.media, animated: true, render: renderId, video: change ? p.media?.video : undefined, render_error: undefined, render_status: "", changing } });
    } else if (p.kind === "reel") {
      if (opts.render) {
        Object.assign(patch, { status: "draft", media: { ...p.media, video: opts.render, sheet: String(opts.render).replace(/\.mp4$/, "-sheet.jpg"), render: undefined, render_error: undefined } });
      } else {
        if (!opts.clip) return Response.json({ error: "Pick the clip to render." }, { status: 400 });
        // A change to a made reel: the editor starts from the last edit and makes only these changes.
        const change = typeof opts.revise?.change === "string" ? opts.revise.change.trim().slice(0, 6000) : "";
        // The notes stay on the reel, so the next render (and the team) can see what was asked for.
        const notes = change ? "" : typeof opts.notes === "string" ? opts.notes.trim().slice(0, 4000) : (p.editor_notes ?? "");
        if (!change) patch.editor_notes = notes || null;
        // The newest upload of the editor wins, so a new version goes live by uploading it.
        const { data: up } = await storage().list("uploads", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
        const engine = (up ?? []).find((f) => /stack-engine.*\.tgz$/.test(f.name));
        if (!engine) return Response.json({ error: "The reel editor file isn't uploaded." }, { status: 400 });
        // A clip cut from two camera feeds is the two-person stack; anything else is one 9:16 frame.
        const own = opts.clip === p.media?.clip && p.media?.cut;
        const pair: Partial<ReturnType<typeof stackPair>> = own && p.media!.cut!.source === "feeds" ? stackPair(people(await episodeFeeds(p.episode_id))) : {};
        const stacked = !!(pair.top && pair.bottom);
        // Who speaks when inside the clip, from the transcript's speaker turns (the host underneath, the guest on top).
        // The same lines are the reference text for the editor's captions.
        const turns: NonNullable<EditContext["turns"]> = [], script: NonNullable<EditContext["script"]> = [];
        if (own) {
          const { lines } = parseTranscript(await transcriptFor(p.episode_id));
          const a = p.media!.cut!.start, b = p.media!.cut!.end;
          // a transcript with one name on every line takes its speakers from the voices instead
          const runs = stacked && new Set(lines.map((l) => l.who).filter(Boolean)).size < 2 ? await speakerRuns(p.episode_id) : [];
          const nameOf = (side: Side) => side === "top" ? pair.top?.person ?? ep.guest ?? "Guest" : pair.bottom?.person ?? OWNER_FULL;
          const sideAt = (t: number) => runs.reduce<Side>((s, r) => (r.t <= t ? r.side : s), runs[0]?.side ?? "bottom");
          // the person heard most between two times
          const most = (lo: number, hi: number) => {
            const got: Record<Side, number> = { top: 0, bottom: 0 };
            runs.forEach((r, k) => { got[r.side] += Math.max(0, Math.min(hi, runs[k + 1]?.t ?? Infinity) - Math.max(lo, r.t)); });
            return got.top === got.bottom ? sideAt(lo) : got.top > got.bottom ? "top" : "bottom";
          };
          if (runs.length) {
            const first = sideAt(a);
            turns.push({ at: 0, side: first, who: nameOf(first) });
            for (const r of runs) if (r.t > a && r.t < b && r.side !== turns[turns.length - 1].side) turns.push({ at: Math.round((r.t - a) * 100) / 100, side: r.side, who: nameOf(r.side) });
          }
          lines.forEach((l, i) => {
            if ((lines[i + 1]?.t ?? Infinity) <= a || l.t >= b) return;
            const at = Math.max(0, Math.round((l.t - a) * 100) / 100);
            script.push({ at, who: runs.length ? nameOf(most(Math.max(a, l.t), Math.min(b, lines[i + 1]?.t ?? b))) : l.who, text: l.text });
            const side = isHost(l.who) ? "bottom" : "top";
            if (!runs.length && stacked && l.who && turns[turns.length - 1]?.side !== side) turns.push({ at, side, who: l.who });
          });
        }
        // The last edit's plan, lined up with this clip: a clip that now starts earlier moves every time later.
        let previous: Record<string, unknown> | undefined;
        if (change) {
          const f = p.media?.plan && !p.media.plan.endsWith("deck.json") ? await storage().download(p.media.plan) : null;
          if (!f?.data) return Response.json({ error: "The last edit's plan is missing, so it can't be changed. Make the reel again." }, { status: 400 });
          const pl = JSON.parse(await f.data.text());
          const was = Number.isFinite(pl.clip_start) ? Number(pl.clip_start) : Number(opts.revise.from);
          const now = own ? p.media!.cut!.start : was;
          previous = previousEdit(pl, Number.isFinite(was) && Number.isFinite(now) ? was - now : 0);
        }
        // the owner's own review rules, for the coach's first look at the plan before the render
        const { data: rules } = await sb.from("studio_rules").select("body").eq("status", "active").order("created_at");
        const context: EditContext & Revision = {
          layout: stacked ? "stack" : "single",
          episode: ep,
          piece: { num: p.num, title: p.title, hook: p.hook, caption: p.caption ?? null },
          top: pair.top?.person ?? ep.guest ?? undefined,
          bottom: pair.bottom?.person ?? OWNER_FULL,
          show: ep.show,
          duration: own ? p.media!.cut!.end - p.media!.cut!.start : undefined,
          turns,
          script,
          notes: notes || undefined,
          previous,
          change: change || undefined,
          start: own ? p.media!.cut!.start : undefined,
          rules: (rules ?? []).map((x) => x.body),
        };
        const renderId = await startEdit(opts.clip, `uploads/${engine.name}`, context);
        // a change keeps the reel and the coach's review on screen until the new version lands
        if (change) delete patch.review;
        const changing = change ? { reply: String(opts.revise.reply ?? "").slice(0, 400), at: new Date().toISOString() } : undefined;
        Object.assign(patch, { status: "making", media: { ...p.media, render: renderId, video: change ? p.media?.video : undefined, render_error: undefined, render_status: "", changing } });
      }
    } else if (p.kind === "carousel" && Array.isArray(opts.slides)) {
      if (!opts.slides.length) return Response.json({ error: "Pick the slide images." }, { status: 400 });
      Object.assign(patch, { status: "draft", media: { ...p.media, slides: opts.slides, render: undefined, rendered: undefined, render_error: undefined } });
      // slides put together by hand get their caption too (only a build that lands drafted one before)
      if (!hasCopy(p)) await queueCopy(req, [id]).catch(() => null);
    } else if (p.kind === "carousel") {
      const notes = typeof opts.notes === "string" ? opts.notes.trim().slice(0, 4000) : (p.editor_notes ?? "");
      patch.editor_notes = notes || null;
      const buildId = await startCarouselBuild(p, ep, notes);
      // the slides it has stay visible until the new build lands
      Object.assign(patch, { status: "making", media: { ...p.media, render: buildId, render_error: undefined, render_status: "" } });
    } else {
      patch.status = "draft";
    }

    const upd = await sb.from("studio_pieces").update(patch).eq("id", id).select().single();
    if (upd.error) throw upd.error;
    const [piece] = await withUrls([upd.data as Piece]);
    return Response.json({ piece });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
