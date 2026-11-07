import { db, storage, sign, fileKind, safeError } from "../../../../lib/supabase";
import { refresh, withUrls, type Piece } from "../../../../lib/pieces";
import { latestAnswers } from "../../../../lib/questions";
import { parseTranscript, pickTranscript, TRACKS } from "../../../../lib/transcript";
import { retimeMoments } from "../../../../lib/retime";
import { autoProduce } from "../../../../lib/produce";
import { episodeOut, renderStatus } from "../../../../lib/render";
import { feedOf, people, type Feed } from "../../../../lib/feeds";
import { claimRun, runConcepts } from "../../../../lib/concepts";
import { slotFor } from "../../../../lib/cadence";
import { cleanStage } from "../../../../lib/stages";
import { copyRelay, needsCopy, queueCopy } from "../../../../lib/copy";
import { HANDLE_FIELDS, cleanHandle } from "../../../../lib/guests";
import { episodeExtras } from "../../../../lib/links";
import { secs } from "../../../../lib/time";
import { after } from "next/server";
import { OWNER } from "../../../../lib/brand";

type Stack = { status: "running" | "ready" | "failed"; job: string; path: string; at: string; log?: string };
type Transcribe = { status: "running" | "ready" | "failed"; job: string; at: string; sources?: string[]; log?: string; found?: boolean };
type FullEdit = { status: "running" | "ready" | "failed"; job: string; path: string; at: string; start: number | null; end: number | null; log?: string; notes?: string | null; produced?: boolean };

// Transcribing an upload: while it runs, check the cloud machine; once it's done, find the moments on their own, or move
// the moments already found to the new transcript's times (only the request that records the finish does, so two open
// tabs don't run it twice).
async function transcribeState(id: string, tr: Transcribe | null, hasPieces: boolean, copy: (ids: string[]) => Promise<void>) {
  if (!tr || tr.status !== "running") return tr;
  const s = await renderStatus(tr.job);
  if (!s.done) return { ...tr, log: s.status };
  const next: Transcribe = { ...tr, status: s.ok ? "ready" : "failed", log: s.status, found: s.ok && !hasPieces };
  const { data } = await db().from("studio_episodes").update({ transcribe: next }).eq("id", id).filter("transcribe->>status", "eq", "running").select("id");
  // then their captions and posts
  if (data?.length && next.found) after(() => claimRun(id, "Studio").then((ok) => (ok ? runConcepts(id, copy) : null)).catch((e) => console.error("finding the moments after transcription failed:", String(e).slice(0, 200))));
  if (data?.length && s.ok && hasPieces) after(() => retimeMoments(id).catch((e) => console.error("moving the moments to the new transcript failed:", String(e).slice(0, 200))));
  return next;
}

// The produced episode: while it runs, check the cloud machine; once it stops, record how it ended (only the request
// that sees it running writes, so two open tabs agree). A finished one is the full-episode piece's video, with the owner.
async function editState(id: string, ed: FullEdit | null) {
  if (!ed || ed.status !== "running") return ed;
  if (!ed.job) return ed;                 // claimed, the machine is starting
  const s = await renderStatus(ed.job);
  if (!s.done) return { ...ed, log: s.status };
  const next: FullEdit = { ...ed, status: s.ok ? "ready" : "failed", log: s.status };
  const { data } = await db().from("studio_episodes").update({ full_edit: next }).eq("id", id).filter("full_edit->>status", "eq", "running").select("id");
  if (data?.length && s.ok) await episodeMade(id, next).catch((e) => console.error("marking the episode made failed:", String(e).slice(0, 200)));
  return next;
}

async function episodeMade(id: string, ed: FullEdit) {
  const sb = db(), o = episodeOut(ed.job), at = new Date().toISOString();
  const { data: p } = await sb.from("studio_pieces").select("id, status, media, scheduled_at").eq("episode_id", id).eq("kind", "episode").order("num").limit(1).maybeSingle();
  if (!p) return;
  const log = ed.log ?? "";
  // the editor's plan (teaser, chapters, graphics) failed and it made the plain cut instead: say so, so nobody approves
  // a plain episode as the produced one
  const plain = log.match(/^plan: plain(?: \((.*)\))?$/m);
  const chapters = !plain && !/\b0 chapters\b/.test(log);
  const media = { ...(p.media ?? {}), video: ed.path, sheet: o.sheet, plan: o.plan, srt: o.srt, ...(chapters ? { chapters: o.chapters } : {}), rendered: ed.job };
  // the full episode keeps Sunday 9:00 to itself (lib/cadence.ts), so it gets its slot when it's made
  const slot = p.scheduled_at ? null : await slotFor(sb, "episode", p.id);
  await sb.from("studio_pieces").update({ media, status: p.status === "scheduled" ? p.status : "ready", review: null, ...(slot ? { scheduled_at: slot } : {}), updated_at: at }).eq("id", p.id);
  const made = log.match(/^episode: (.*)$/m)?.[1];
  await sb.from("studio_notes").insert({ piece_id: p.id, author: "Studio", kind: "note", body: plain
    ? `The episode finished, but the editor's plan didn't come back${plain[1] ? ` (${plain[1]})` : ""}, so it's the plain cut: no teaser, chapters or graphics. Use Make it again before ${OWNER} approves it.`
    : `The produced episode is ready${made ? ` (${made})` : ""}. It's with ${OWNER} to approve.` });
}

// The stacked preview job: while it runs, check the cloud machine; once it stops, record how it ended.
async function stackState(id: string, stack: Stack | null) {
  if (!stack || stack.status !== "running") return stack;
  const s = await renderStatus(stack.job);
  if (!s.done) return { ...stack, log: s.status };
  const next: Stack = { ...stack, status: s.ok ? "ready" : "failed", log: s.status };
  await db().from("studio_episodes").update({ stack: next }).eq("id", id);
  return next;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long enough for the work that runs after the response: the coach's automatic review of a reel that just finished
// rendering, and the Moment Coach's two passes after a transcription (a few minutes).
export const maxDuration = 800;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = db();
    const [ep, pcs, files, rends, full, feedList] = await Promise.all([
      sb.from("studio_episodes").select("*").eq("id", id).single(),
      sb.from("studio_pieces").select("*").eq("episode_id", id).order("num"),
      storage().list(`episodes/${id}`, { limit: 200, sortBy: { column: "created_at", order: "asc" } }),
      storage().list("renders", { limit: 50, sortBy: { column: "created_at", order: "desc" } }),
      storage().list(`episodes/${id}/full`, { limit: 20, sortBy: { column: "created_at", order: "desc" } }),
      storage().list(`episodes/${id}/feeds`, { limit: 100 }),
    ]);
    if (ep.error) throw ep.error;
    const feeds = (feedList.data ?? []).filter((f) => f.id).map((f) => feedOf(`episodes/${id}/feeds/${f.name}`, (f.metadata as { size?: number } | null)?.size ?? 0)).filter(Boolean) as Feed[];
    const stack = await stackState(id, (ep.data.stack ?? null) as Stack | null);
    const edit = await editState(id, (ep.data.full_edit ?? null) as FullEdit | null);
    // a finished episode's extras: the YouTube chapters, the captions file, the frame sheet of its animated moments
    const extra = edit?.status === "ready" && edit.job?.startsWith("fulledit-") ? await (async () => {
      const o = episodeOut(edit.job);
      const [ch, links] = await Promise.all([
        storage().download(o.chapters).then(async (r) => (r.data ? (await r.data.text()).slice(0, 4000) : "")).catch(() => ""),
        sign([o.srt, o.sheet], 6 * 3600),
      ]);
      return { chapters: ch, srt: links[o.srt] ?? null, sheet: links[o.sheet] ?? null };
    })() : null;
    const transcribe = await transcribeState(id, (ep.data.transcribe ?? null) as Transcribe | null, (pcs.data ?? []).length > 0, copyRelay(req));
    const stackUrl = stack?.status === "ready" ? (await storage().createSignedUrl(stack.path, 6 * 3600)).data?.signedUrl ?? null : null;
    const list = (files.data ?? []).filter((f) => f.id).map((f) => ({
      path: `episodes/${id}/${f.name}`,
      name: f.name.replace(/^\d+-/, ""),
      size: (f.metadata as { size?: number } | null)?.size ?? 0,
      type: fileKind(f.name),
    }));
    // The full episode (one or more uploads), newest first, with a private link long enough to trim in the player.
    const fulls = (full.data ?? []).filter((f) => f.id && fileKind(f.name) === "clip").map((f) => ({
      path: `episodes/${id}/full/${f.name}`,
      name: f.name.replace(/^\d+-/, ""),
      size: (f.metadata as { size?: number } | null)?.size ?? 0,
    }));
    const [urls, fullUrls] = await Promise.all([sign(list.filter((f) => f.type === "image").map((f) => f.path)), sign(fulls.map((f) => f.path), 6 * 3600)]);
    // The transcript as timed lines, so each reel idea shows what's said in its moment. Captions (.srt, .vtt) are exact.
    const txName = pickTranscript((files.data ?? []).filter((f) => f.id))?.name;
    // a recent episode with camera feeds and exact word times gets its produced edit without anyone asking
    const exactTx = !!txName && (TRACKS.test(txName) || /\.(srt|vtt)$/i.test(txName));
    if (transcribe?.status !== "running") after(() => autoProduce(ep.data, exactTx, feeds.some((f) => f.kind === "video")).catch((e) => console.error("starting the produced episode failed:", String(e).slice(0, 200))));
    const tx = txName ? { path: `episodes/${id}/${txName}` } : null;
    const said = tx ? storage().download(tx.path).then(async (r) => (r.data ? parseTranscript(await r.data.text()) : null)).catch(() => null) : Promise.resolve(null);
    const all = (pcs.data ?? []) as Piece[];
    // A piece still without its caption or post (added by hand, or its first try ran out of time) starts now.
    const due = all.filter((p) => needsCopy(p));
    if (due.length) {
      const c = await queueCopy(req, due.map((p) => p.id)).catch(() => null);
      for (const p of due) if (c?.ids.includes(p.id)) p.copy_since = c.at;
    }
    const [made, answers, transcript, extras] = await Promise.all([Promise.all(all.map(refresh)).then(withUrls), latestAnswers(all.map((p) => p.id)), said, episodeExtras(id)]);
    const pieces = made.map((p) => ({ ...p, answer: answers[p.id] ?? null }));
    const renders = (rends.data ?? []).filter((f) => f.id && f.name.endsWith(".mp4")).map((f) => `renders/${f.name}`);
    // link: the one the first comment uses (the episode's own, else the published episode's video or blog post)
    return Response.json({ episode: ep.data, link: extras.link, files: list.map((f) => ({ ...f, url: urls[f.path] ?? null })), fulls: fulls.map((f) => ({ ...f, url: fullUrls[f.path] ?? null })), lines: transcript?.lines ?? [], rough: transcript?.rough ?? true, exact: !!txName && (TRACKS.test(txName) || /\.(srt|vtt)$/i.test(txName)), feeds: people(feeds), stack: stack ? { status: stack.status, log: stack.log ?? "", url: stackUrl, at: stack.at } : null, transcribe: transcribe ? { status: transcribe.status, log: transcribe.log ?? "", at: transcribe.at, sources: transcribe.sources ?? [], found: !!transcribe.found } : null, full_edit: edit ? { status: edit.status, log: edit.log ?? "", at: edit.at, path: edit.path, start: edit.start, end: edit.end, notes: edit.notes ?? "", from: (secs(edit.log?.match(/edit: ([\d:.]+) to /)?.[1]) || edit.start || 0) - Number(edit.log?.match(/^cold open: ([\d.]+) s$/m)?.[1] ?? 0), ...(extra ?? {}) } : null, pieces, renders });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

// The guest's handles, for tagging (lib/guests.ts), and the episode's own link, for the first comment.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if (body.guest_handles && typeof body.guest_handles === "object") {
      const handles: Record<string, string> = {};
      for (const { net, label } of HANDLE_FIELDS) {
        const raw = String(body.guest_handles[net] ?? "").trim();
        const h = cleanHandle(net, raw);
        if (raw && !h) return Response.json({ error: net === "linkedin" ? "The LinkedIn one is the guest's profile link, like https://www.linkedin.com/in/name" : `The ${label} handle doesn't look right. Use @name or the profile link.` }, { status: 400 });
        if (h) handles[net] = h;
      }
      patch.guest_handles = handles;
    }
    if ("link" in body) {
      const link = String(body.link ?? "").trim();
      if (link && !/^https:\/\/\S{4,500}$/.test(link)) return Response.json({ error: "The episode link starts with https://" }, { status: 400 });
      patch.link = link || null;
    }
    if (!Object.keys(patch).length) return Response.json({ error: "Nothing to save." }, { status: 400 });
    const { data, error } = await db().from("studio_episodes").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return Response.json({ episode: data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

// Add a piece by hand, e.g. a Riverside Magic Clip the concept pass didn't pick.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { kind, title, source_time, awareness } = await req.json();
    if (!["reel", "carousel", "post"].includes(kind)) return Response.json({ error: "Pick reel, carousel or post." }, { status: 400 });
    if (!title || typeof title !== "string") return Response.json({ error: "Give the piece a title." }, { status: 400 });
    const sb = db();
    const { data: last } = await sb.from("studio_pieces").select("num").eq("episode_id", id).order("num", { ascending: false }).limit(1);
    const num = (last?.[0]?.num ?? 0) + 1;
    // a piece added by hand is kept, so it takes the next open slot like any kept piece, and the level the team picked
    const stage = cleanStage(awareness, null);
    const scheduled_at = await slotFor(sb, kind);
    const { data, error } = await sb.from("studio_pieces").insert({ episode_id: id, num, kind, title: title.slice(0, 200), hook: null, source_time: typeof source_time === "string" && source_time ? source_time.slice(0, 8) : null, why: null, status: "kept", awareness: stage.awareness, funnel: stage.funnel, scheduled_at }).select().single();
    if (error) throw error;
    const c = await queueCopy(req, [data.id]).catch(() => null);
    if (c?.ids.length) data.copy_since = c.at;
    return Response.json({ piece: data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
