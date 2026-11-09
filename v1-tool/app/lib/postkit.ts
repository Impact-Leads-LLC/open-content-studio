import { db, storage, fileKind } from "./supabase";
import { episodeFeeds, people } from "./feeds";
import { frameAt, coverPath } from "./render";
import { LABEL, LIMIT, captionFor, fitCaption, paras, platformsFor, type Platform } from "./platforms";
import { BOOKING_OFFER, bookingUrl } from "./brand";
import { SLOT_TZ } from "./cadence";
import { pointsToComment, tagGuest } from "./guests";
import { episodeExtras } from "./links";
import type { Piece } from "./pieces";

// The posting kit, for a studio that posts with a scheduler the app doesn't connect to (SCHEDULER=export: Flick,
// Buffer, Later, Hootsuite...): the piece's files with download links, and each network's caption written exactly as
// the send route would send it (fitted to the network, the guest tagged, the first comment it points to). The team
// uploads them in their own tool and marks the piece scheduled, so the calendar and the cleanup know it went out.
export type KitFile = { name: string; url: string; kind: "video" | "cover" | "image" | "slide" };
export type KitPost = { network: Platform; label: string; text: string; firstComment: string | null; limit: number; warnings: string[] };
// where a first comment can be posted
const FIRST_COMMENT: Platform[] = ["linkedin", "facebook", "instagram", "youtube"];
// the stored file's own extension, so a .jpg downloads as .jpg
const ext = (path: string, d: string) => (path.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? d).toLowerCase();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "piece";

// signed links that download under a readable name, good for `secs` (a week by default, so a bulk upload can fetch them)
async function links(files: { path: string; name: string; kind: KitFile["kind"] }[], secs: number): Promise<KitFile[]> {
  const out: KitFile[] = [];
  for (const f of files) {
    const { data } = await storage().createSignedUrl(f.path, secs, { download: f.name });
    if (data?.signedUrl) out.push({ name: f.name, url: data.signedUrl, kind: f.kind });
  }
  return out;
}

// The full episode's video: the newest finished episode in full/ (the produced edit lands there), the piece's own video,
// or, for an episode recorded as one video, its only camera file. Its cover: the thumbnail picked in the Thumbnail panel.
export async function episodeVideo(p: Piece) {
  const { data: full } = await storage().list(`episodes/${p.episode_id}/full`, { limit: 20, sortBy: { column: "created_at", order: "desc" } });
  const f = (full ?? []).find((x) => x.id && fileKind(x.name) === "clip");
  let video = f ? `episodes/${p.episode_id}/full/${f.name}` : p.media?.video ?? null;
  if (!video) {
    const cams = people(await episodeFeeds(p.episode_id)).filter((x) => x.video);
    if (cams.length === 1) video = cams[0].video!.path;
  }
  const thumb = (p.media as { thumb?: { picked?: { path?: string } | null } } | undefined)?.thumb?.picked?.path ?? null;
  return { video, thumb };
}

export async function postingKit(p: Piece, secs = 7 * 86400) {
  const m = { ...p.media };
  const base = `${String(p.num).padStart(2, "0")}-${slug(p.title)}`;
  const files: { path: string; name: string; kind: KitFile["kind"] }[] = [];
  if (p.kind === "reel" && m.video) {
    // a reel with no cover gets one from its first half-second, saved so the next kit doesn't start a machine again
    let cover = m.cover;
    if (!cover) {
      cover = await frameAt(m.video, 0.5, m.render ? coverPath(m.render) : m.video.replace(/\.mp4$/, "-cover.jpg"));
      await db().from("studio_pieces").update({ media: { ...m, cover } }).eq("id", p.id);
    }
    files.push({ path: m.video, name: `${base}.${ext(m.video, "mp4")}`, kind: "video" }, { path: cover, name: `${base}-cover.${ext(cover, "jpg")}`, kind: "cover" });
  } else if (p.kind === "carousel" && m.slides?.length) {
    m.slides.forEach((s, i) => files.push({ path: s, name: `${base}-slide-${String(i + 1).padStart(2, "0")}.${ext(s, "png")}`, kind: "slide" }));
  } else if (p.kind === "post" && m.image) {
    files.push({ path: m.image, name: `${base}.${ext(m.image, "png")}`, kind: "image" });
  } else if (p.kind === "episode") {
    const { video, thumb } = await episodeVideo(p);
    if (video) files.push({ path: video, name: `${base}.${ext(video, "mp4")}`, kind: "video" });
    if (thumb) files.push({ path: thumb, name: `${base}-thumbnail.${ext(thumb, "jpg")}`, kind: "cover" });
  }
  const { guest, link } = await episodeExtras(p.episode_id);
  const chapters = p.kind === "episode" && m.chapters ? await storage().download(String(m.chapters)).then(async (f) => (f.data ? (await f.data.text()).trim().slice(0, 3000) : "")).catch(() => "") : "";
  const posts: KitPost[] = platformsFor(p.kind, p.channels, !!m.image).map((net) => {
    const tag = (t: string) => tagGuest(t, guest, net);
    const own = p.captions?.[net];
    let text = p.kind === "post" ? fitCaption(tag(own ?? p.body ?? ""), LIMIT[net]) : captionFor(tag(p.caption ?? p.body ?? ""), own ? { [net]: tag(own) } : {}, net);
    if (p.kind === "episode" && net === "youtube" && chapters && !text.includes(chapters.split("\n")[0])) text = `${text}\n\n${chapters}`.slice(0, LIMIT.youtube);
    const warnings: string[] = [];
    if (!text.trim()) warnings.push(`No ${p.kind === "post" ? "post" : "caption"} for ${LABEL[net]} yet. Write it first.`);
    let firstComment: string | null = null;
    const last = paras(text).slice(-1)[0] ?? "";
    if (FIRST_COMMENT.includes(net) && pointsToComment(last)) {
      if (/assessment|\bbook\b|\bcall\b/i.test(last) && bookingUrl()) firstComment = `Book ${BOOKING_OFFER}: ${bookingUrl()}`;
      else if (link) firstComment = `Full episode${guest.name ? ` with ${guest.name}` : ""}: ${link}`;
      else warnings.push("The caption points to a first comment, and the episode has no link yet. Add it under Guest and links.");
    }
    if (net === "linkedin" && guest.name) warnings.push(`Tag ${guest.name} by hand on LinkedIn.`);
    return { network: net, label: LABEL[net], text, firstComment, limit: LIMIT[net], warnings };
  });
  return { files: await links(files, secs), posts, when: p.scheduled_at, timezone: SLOT_TZ };
}
