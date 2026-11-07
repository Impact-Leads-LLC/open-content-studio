import { after } from "next/server";
import { db, storage, sign, fileKind, safeError } from "../../../../../lib/supabase";
import { driveReady, saveToDrive } from "../../../../../lib/drive";
import { withUrls, type Piece, type CsSend } from "../../../../../lib/pieces";
import { actor } from "../../../../../lib/auth";
import { frameAt, coverPath } from "../../../../../lib/render";
import { LABEL, LIMIT, captionFor, fitCaption, paras, platformsFor, type Platform } from "../../../../../lib/platforms";
import { FIRST_COMMENT, NAME, accountFor, accounts, configured, connection, createPost, notConnected, postStatus, postType, prepareMedia, why, type Media, type Result } from "../../../../../lib/scheduler";
import { BOOKING_OFFER, OWNER, bookingUrl } from "../../../../../lib/brand";
import { pointsToComment, tagGuest } from "../../../../../lib/guests";
import { episodeExtras } from "../../../../../lib/links";

export const runtime = "nodejs";
// a scheduled piece's files are copied to Google Drive after the response (a full episode can take minutes)
export const maxDuration = 800;

const DAY = 24 * 3600;

// Send the piece to the scheduler (lib/scheduler.ts), one post per network. Drafts (anyone signed in, any made piece)
// never publish; scheduling (the owner, an approved piece with a date) puts it on the scheduler's calendar. For tests, `platforms`,
// `images` (storage paths) and `text` can narrow or replace what goes.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = actor(req);
    if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
    if (!configured()) return Response.json({ error: notConnected() }, { status: 400 });
    const { id } = await params;
    const opts = await req.json().catch(() => ({}));
    const mode: "draft" | "scheduled" = opts.mode === "scheduled" ? "scheduled" : "draft";
    const sb = db();
    const { data, error } = await sb.from("studio_pieces").select("*").eq("id", id).single();
    if (error) throw error;
    const p = data as Piece;
    if (mode === "scheduled") {
      if (me.role !== "owner") return Response.json({ error: `Only ${OWNER} schedules posts.` }, { status: 403 });
      if (!["approved", "scheduled"].includes(p.status)) return Response.json({ error: `${OWNER} approves it first.` }, { status: 400 });
      if (!p.scheduled_at) return Response.json({ error: "Give it a date first." }, { status: 400 });
    } else if (["concept", "kept", "skipped", "making"].includes(p.status) && p.kind !== "episode") {
      return Response.json({ error: "Make the piece first." }, { status: 400 });
    }

    // The media: a reel's video and its cover (the frame at 0.5 s), a carousel's slides, a full episode's video and a
    // thumbnail from its first half-second.
    const m: Media = {};
    const media = { ...p.media };
    if (Array.isArray(opts.images) && opts.images.length) {
      const u = await sign(opts.images, DAY);
      m.images = opts.images.map((x: string) => u[x]).filter(Boolean);
    } else if (p.kind === "reel" && media.video) {
      if (!media.cover) media.cover = await frameAt(media.video, 0.5, media.render ? coverPath(media.render) : media.video.replace(/\.mp4$/, "-cover.jpg"));
      const u = await sign([media.video, media.cover], DAY);
      Object.assign(m, { video: u[media.video], cover: u[media.cover] });
    } else if (p.kind === "post" && media.image) {
      // a text post with an image attached goes out as an image post (and can go to Instagram)
      const u = await sign([media.image], DAY);
      if (u[media.image]) m.images = [u[media.image]];
    } else if (p.kind === "carousel" && media.slides?.length) {
      const u = await sign(media.slides, DAY);
      m.images = media.slides.map((s) => u[s]).filter(Boolean);
    } else if (p.kind === "episode") {
      const { data: full } = await storage().list(`episodes/${p.episode_id}/full`, { limit: 20, sortBy: { column: "created_at", order: "desc" } });
      const f = (full ?? []).find((x) => x.id && fileKind(x.name) === "clip");
      if (!f) return Response.json({ error: "Upload the full episode video first." }, { status: 400 });
      const video = `episodes/${p.episode_id}/full/${f.name}`;
      const thumb = await frameAt(video, 0.5, `episodes/${p.episode_id}/full/thumbnail-${f.name.replace(/\.[^.]+$/, "")}.jpg`);
      const u = await sign([video, thumb], DAY);
      Object.assign(m, { video: u[video], cover: u[thumb] });
    }

    const conn = await connection();
    const list = await accounts(conn);
    const nets: Platform[] = Array.isArray(opts.platforms) && opts.platforms.length ? opts.platforms : platformsFor(p.kind, p.channels, !!media.image);
    if (mode === "scheduled" && Date.parse(p.scheduled_at!) < Date.now() + 5 * 60000) return Response.json({ error: "Its date has passed. Give it a new one first." }, { status: 400 });
    // the scheduler's own copy of the media, made once before any post (Metricool needs one; ContentStudio doesn't)
    const going = nets.filter((n) => accountFor(list, n) && postType(n, p.kind, m));
    let held: Media = m;
    try { if (going.length) held = await prepareMedia(m, conn); }
    catch (e) { return Response.json({ error: `${NAME} couldn't take the media: ${safeError(e)}` }, { status: 502 }); }
    // the guest, to tag, and the episode's link, for a first comment
    const { guest, link } = await episodeExtras(p.episode_id);
    const chapters = p.kind === "episode" && media.chapters ? await storage().download(String(media.chapters)).then(async (f) => (f.data ? (await f.data.text()).trim().slice(0, 3000) : "")).catch(() => "") : "";
    const results: Result[] = [];
    for (const net of nets) {
      const acc = accountFor(list, net);
      if (!acc) { results.push({ platform: net, ok: false, error: `No ${LABEL[net]} account is connected in ${NAME}.` }); continue; }
      if (!postType(net, p.kind, m)) { results.push({ platform: net, account: acc.account_name, ok: false, error: `${why(net, p.kind)}.` }); continue; }
      // a post is its own text; anything else gets the shared caption (fitted to the network) unless it has its own. The
      // guest's @handle goes in where it first names them, on the networks where that tags them.
      const tag = (t: string) => tagGuest(t, guest, net);
      const own = p.captions?.[net];
      let text = typeof opts.text === "string" ? opts.text : p.kind === "post" ? fitCaption(tag(own ?? p.body ?? ""), LIMIT[net]) : captionFor(tag(p.caption ?? p.body ?? ""), own ? { [net]: tag(own) } : {}, net);
      // the full episode on YouTube: its chapters under the description (the produced edit writes them), which YouTube reads
      if (p.kind === "episode" && net === "youtube" && typeof opts.text !== "string" && chapters && !text.includes(chapters.split("\n")[0])) text = `${text}\n\n${chapters}`.slice(0, LIMIT.youtube);
      if (!text.trim()) { results.push({ platform: net, account: acc.account_name, ok: false, error: `There's no ${p.kind === "post" ? "post" : "caption"} for ${LABEL[net]} yet. Write it first.` }); continue; }
      // the scheduler turns down text over a network's limit; say so here, in words the team can act on
      if (text.length > LIMIT[net]) { results.push({ platform: net, account: acc.account_name, ok: false, error: `The ${LABEL[net]} caption is ${text.length.toLocaleString()} characters and ${LABEL[net]} takes ${LIMIT[net].toLocaleString()}. Write a ${LABEL[net]} caption first.` }); continue; }
      // A caption that says the link is in the comments gets it there. With no link yet, a draft still goes (with a
      // warning) but nothing is scheduled to point at a comment that won't exist.
      const warn: string[] = [];
      let firstComment: string | undefined;
      const lastPara = paras(text).slice(-1)[0] ?? "";
      if (FIRST_COMMENT.includes(net) && pointsToComment(lastPara)) {
        // the comment carries what the caption points to: the booking page for the offer, else the episode
        if (/assessment|\bbook\b|\bcall\b/i.test(lastPara) && bookingUrl()) firstComment = `Book ${BOOKING_OFFER}: ${bookingUrl()}`;
        else if (link) firstComment = `Full episode${guest.name ? ` with ${guest.name}` : ""}: ${link}`;
        else if (mode === "scheduled") { results.push({ platform: net, account: acc.account_name, ok: false, error: `The ${LABEL[net]} caption says the link is in the comments, and the episode has no link yet. Add it on the episode page (Guest and links), then schedule again.` }); continue; }
        else warn.push("No episode link yet, so no first comment. Add it on the episode page before scheduling.");
      }
      // the guest as an Instagram co-author on reels and carousels, unless someone turned it off for this piece
      const collaborators = net === "instagram" && ["reel", "carousel"].includes(p.kind) && guest.handles.instagram && !media.no_collab ? [guest.handles.instagram] : undefined;
      const draft = { platform: net, text, media: held, title: p.title, kind: p.kind, firstComment };
      try {
        let r: Awaited<ReturnType<typeof createPost>>;
        try {
          r = await createPost(conn, { ...draft, collaborators }, acc, mode, p.scheduled_at);
        } catch (e) {
          // an invite Instagram turns down never holds up the post
          if (!collaborators) throw e;
          r = await createPost(conn, draft, acc, mode, p.scheduled_at);
          warn.push(`Went out without the collaborator invite to ${collaborators[0]} (${safeError(e)}).`);
        }
        if (collaborators && !warn.some((w) => w.includes("collaborator"))) warn.push(`Invited ${collaborators[0]} as a collaborator.`);
        if (firstComment) warn.push("The episode link goes in the first comment.");
        results.push({ platform: net, account: acc.account_name, ok: true, post_id: r.id, url: r.post_url, warning: [r.warning, ...warn].filter(Boolean).join(" ") || undefined });
      } catch (e) {
        results.push({ platform: net, account: acc.account_name, ok: false, error: safeError(e) });
      }
    }
    const cs: CsSend = { at: new Date().toISOString(), mode, results };
    const patch: Record<string, unknown> = { media: { ...media, cs }, updated_at: new Date().toISOString() };
    if (mode === "scheduled" && results.some((r) => r.ok)) patch.status = "scheduled";
    const upd = await sb.from("studio_pieces").update(patch).eq("id", id).select().single();
    if (upd.error) throw upd.error;
    const ok = results.filter((r) => r.ok).map((r) => LABEL[r.platform]), bad = results.filter((r) => !r.ok);
    // LinkedIn tags can't be made through the API, so the thread says who to tag by hand
    const tagByHand = guest.name && results.some((r) => r.ok && r.platform === "linkedin") ? ` Tag ${guest.name} on LinkedIn by hand, in ${NAME} before it posts or on LinkedIn after${guest.handles.linkedin ? ` (${guest.handles.linkedin})` : ""}.` : "";
    await sb.from("studio_notes").insert({ piece_id: id, author: me.name, kind: "note", body: `${mode === "draft" ? `Sent to ${NAME} as drafts` : `Scheduled in ${NAME}`}: ${ok.join(", ") || "nothing went through"}.${bad.length ? ` Didn't go: ${bad.map((r) => `${LABEL[r.platform]} (${r.error})`).join("; ")}` : ""}${tagByHand}` });
    // once it's scheduled, its finished files go to Google Drive
    if (mode === "scheduled" && results.some((r) => r.ok) && driveReady()) after(() => saveToDrive(id).then(() => {}));
    const [piece] = await withUrls([upd.data as Piece]);
    return Response.json({ piece, results });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

// Where each scheduler post stands now (draft, scheduled, published, failed...) with each account's error.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!actor(req)) return Response.json({ error: "Sign in first." }, { status: 401 });
    const { id } = await params;
    const sb = db();
    const { data, error } = await sb.from("studio_pieces").select("*").eq("id", id).single();
    if (error) throw error;
    const p = data as Piece;
    const cs = p.media?.cs;
    if (!cs?.results?.length || !configured()) return Response.json({ cs: cs ?? null });
    const conn = await connection();
    for (const r of cs.results) {
      if (!r.post_id) continue;
      try { const s = await postStatus(conn, r.post_id); Object.assign(r, { status: s.status, detail: s.detail, url: s.link ?? r.url }); }
      catch (e) { r.detail = safeError(e); }
    }
    await sb.from("studio_pieces").update({ media: { ...p.media, cs } }).eq("id", id);
    return Response.json({ cs });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
