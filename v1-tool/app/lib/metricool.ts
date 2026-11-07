import { LABEL, type Platform } from "./platforms";
import { TIMEZONE } from "./brand";

// Metricool, one of the two schedulers (lib/scheduler.ts picks it with SCHEDULER=metricool). REST API at app.metricool.com/api (OpenAPI: app.metricool.com/api/swagger.json, read
// 2026-11-02); it needs the Advanced plan or above. Auth: the API token in the X-Mc-Auth header, and userId plus blogId
// (the brand) on every call. We send one post per network, so each gets its own type, caption, media and cover, and a
// rejection names the network it came from.
const BASE = "https://app.metricool.com/api";
const clean = (v?: string) => v?.replace(/\s+/g, "") || "";
const creds = () => ({ token: clean(process.env.METRICOOL_API_TOKEN), userId: clean(process.env.METRICOOL_USER_ID), blogId: clean(process.env.METRICOOL_BLOG_ID) });
export const configured = () => { const c = creds(); return !!(c.token && c.userId); };
export const SCHEDULER = "Metricool";

// Metricool's error text, with anything shaped like the token taken out before it reaches the page.
function redact(s: string) {
  const { token } = creds();
  return token && token.length > 6 ? s.split(token).join("[token]") : s;
}

async function mc<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string>; blogId?: string; timeout?: number } = {}): Promise<T> {
  const { token, userId } = creds();
  if (!token || !userId) throw new Error("Add METRICOOL_API_TOKEN and METRICOOL_USER_ID in the Vercel project settings, then redeploy.");
  const url = new URL(BASE + path);
  url.searchParams.set("userId", userId);
  if (init.blogId) url.searchParams.set("blogId", init.blogId);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const r = await fetch(url, {
    method: init.method ?? "GET", cache: "no-store",
    headers: { "X-Mc-Auth": token, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    // copying a video to Metricool's servers can take a while
    signal: AbortSignal.timeout(init.timeout ?? 60_000),
  });
  const raw = await r.text();
  let body: unknown = raw;
  try { body = JSON.parse(raw); } catch { /* some endpoints answer in plain text */ }
  if (!r.ok) {
    const o = (body ?? {}) as { message?: string; error?: string; detail?: string; errors?: unknown };
    const msg = typeof body === "string" ? body.slice(0, 300) : o.message ?? o.error ?? o.detail ?? (o.errors ? JSON.stringify(o.errors).slice(0, 300) : r.statusText);
    throw new Error(redact(`Metricool ${r.status}: ${msg}`));
  }
  return body as T;
}

// One brand (a "blog" in Metricool's API) and the account it has on each of our networks.
export type Brand = { id: string; name: string; timezone: string };
export type Account = { id: string; platform: Platform; account_name: string };
type PublicBlog = { id: number; label?: string; title?: string } & Partial<Record<"instagram" | "facebook" | "tiktok" | "threads" | "linkedinCompany" | "youtube", string | null>>;
const FIELD: Record<Platform, keyof PublicBlog> = { instagram: "instagram", facebook: "facebook", tiktok: "tiktok", threads: "threads", linkedin: "linkedinCompany", youtube: "youtube" };

async function profiles(): Promise<PublicBlog[]> {
  const r = await mc<PublicBlog[] | { data?: PublicBlog[] }>("/admin/simpleProfiles");
  return Array.isArray(r) ? r : r?.data ?? [];
}

// The brand the posts go to: METRICOOL_BLOG_ID when it's set, else the only brand on the account. Never guess between two.
async function blog(): Promise<PublicBlog> {
  const all = await profiles();
  const want = creds().blogId;
  if (want) {
    const b = all.find((x) => String(x.id) === want);
    if (!b) throw new Error("METRICOOL_BLOG_ID isn't one of this account's Metricool brands.");
    return b;
  }
  if (all.length === 1) return all[0];
  throw new Error(`The Metricool account has ${all.length ? `${all.length} brands (${all.map((b) => `${b.label ?? b.title ?? "brand"} = ${b.id}`).join(", ")})` : "no brand"}: set METRICOOL_BLOG_ID to the one this studio posts to.`);
}

export async function brand(): Promise<Brand> {
  const b = await blog();
  return { id: String(b.id), name: b.label ?? b.title ?? `Brand ${b.id}`, timezone: TIMEZONE };
}

export async function accounts(brandId?: string): Promise<Account[]> {
  const all = await profiles();
  const b = brandId ? all.find((x) => String(x.id) === brandId) : await blog();
  if (!b) return [];
  return (Object.keys(FIELD) as Platform[]).filter((p) => b[FIELD[p]]).map((p) => ({ id: String(b.id), platform: p, account_name: String(b[FIELD[p]]) }));
}

export const accountFor = (list: Account[], p: Platform) => list.find((a) => a.platform === p);

export type Media = { video?: string; cover?: string; images?: string[] };
// collaborators: Instagram co-author invites (@handles, up to 3); firstComment: posted under it.
export type Draft = { platform: Platform; text: string; media: Media; title: string; kind: string; collaborators?: string[]; firstComment?: string };
// Where Metricool posts a first comment (TikTok only takes one on professional pages, so it's left out), and how long.
export const FIRST_COMMENT: Platform[] = ["linkedin", "facebook", "instagram", "youtube"];
const COMMENT_MAX: Partial<Record<Platform, number>> = { instagram: 2200, facebook: 8000, linkedin: 1250, youtube: 10000 };

// What each network accepts, by what the piece is. null: the network can't take it (Instagram needs media; YouTube
// needs video; TikTok needs a video or at least 2 images).
export function postType(p: Platform, kind: string, m: Media): string | null {
  const many = (m.images?.length ?? 0) > 1, one = (m.images?.length ?? 0) === 1;
  if (p === "youtube") return m.video ? (kind === "episode" ? "video" : "short") : null;
  if (p === "instagram") return m.video ? "REEL" : many || one ? "POST" : null;
  if (p === "tiktok") return m.video ? "video" : many ? "photo" : null;
  if (p === "facebook") return m.video && kind !== "episode" ? "REEL" : "POST";   // a full episode is a regular video post
  return "post";   // LinkedIn (text, image, video; 2+ images become a PDF document carousel) and Threads
}

// Metricool only posts media it holds a copy of: a private or expiring link (our signed Storage links expire) is skipped
// and the post goes out without it. So every file is copied to Metricool first, and the copy's address goes in the post.
async function normalize(url: string, brandId: string) {
  if (/^https:\/\/(static\.metricool\.com|metricool-[\w-]+\.s3\.[\w-]+\.amazonaws\.com)\//.test(url)) return url;
  const r = await mc<unknown>("/actions/normalize/image/url", { blogId: brandId, query: { url, folder: "PLANNER" }, timeout: 120_000 });
  const o = r as { data?: unknown; url?: unknown };
  const out = typeof r === "string" ? r : typeof o?.data === "string" ? o.data : typeof o?.url === "string" ? o.url : "";
  const clean = out.trim().replace(/^"|"$/g, "");
  if (!/^https?:\/\//.test(clean)) throw new Error("Metricool couldn't take a copy of the media file.");
  return clean;
}

// The same media, held by Metricool. One copy per file, however many networks it goes to.
export async function holdMedia(m: Media, brandId: string): Promise<Media> {
  const out: Media = {};
  if (m.video) out.video = await normalize(m.video, brandId);
  if (m.cover) out.cover = await normalize(m.cover, brandId).catch(() => undefined);   // a cover is nice to have
  if (m.images?.length) out.images = await Promise.all(m.images.slice(0, 20).map((u) => normalize(u, brandId)));
  return out;
}

// "2026-10-30T09:00:00" on the wall clock of `tz`: Metricool takes a local time plus the time zone's name.
export function localTime(iso: string, tz = TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}:${g("second")}`;
}

// One Metricool post for one network. `media` is already held by Metricool (holdMedia). Covers: Instagram reels,
// Facebook, LinkedIn video and YouTube regular videos take an image (our frame at 0.5 s); TikTok takes a time, so
// 500 ms; Shorts take neither (a cover where a network can't use one fails the whole post). A draft still needs a date
// in the future, so it gets the piece's date or tomorrow.
export function buildPost(d: Draft, publish: "draft" | "scheduled", at: string, tz = TIMEZONE) {
  const type = postType(d.platform, d.kind, d.media)!;
  const images = d.media.images?.slice(0, d.platform === "instagram" ? 10 : 20) ?? [];
  const media = d.media.video ? [d.media.video] : images;
  const cover = !!d.media.video && !!d.media.cover && ((d.platform === "instagram") || d.platform === "facebook" || d.platform === "linkedin" || (d.platform === "youtube" && type === "video"));
  const firstLine = d.text.split("\n").find((l) => l.trim())?.trim() ?? d.title;
  const max = COMMENT_MAX[d.platform];
  return {
    text: d.text,
    providers: [{ network: d.platform }],
    publicationDate: { dateTime: localTime(at, tz), timezone: tz },
    media,
    mediaAltText: [],
    autoPublish: true,
    draft: publish === "draft",
    shortener: false,
    ...(d.firstComment && max ? { firstCommentText: d.firstComment.slice(0, max) } : {}),
    ...(cover ? { videoThumbnailUrl: d.media.cover } : {}),
    ...(d.platform === "tiktok" && d.media.video ? { videoCoverMilliseconds: 500 } : {}),
    ...(d.platform === "instagram" ? { instagramData: { type, showReelOnFeed: true, ...(d.collaborators?.length ? { collaborators: d.collaborators.slice(0, 3).map((u) => ({ username: u.replace(/^@/, ""), deleted: false })) } : {}) } } : {}),
    ...(d.platform === "facebook" ? { facebookData: { type, ...(d.media.video && type === "POST" ? { title: d.title.slice(0, 100) } : {}) } } : {}),
    // YouTube wants a title (100 characters at most) and the made-for-kids answer, which is always no
    ...(d.platform === "youtube" ? { youtubeData: { title: (firstLine || d.title).slice(0, 100), type, privacy: "public", madeForKids: false, category: "EDUCATION", tags: [] } } : {}),
    ...(d.platform === "tiktok" ? { tiktokData: { title: (firstLine || d.title).slice(0, 90), privacyOption: "PUBLIC_TO_EVERYONE", disableComment: false, disableDuet: false, disableStitch: false, autoAddMusic: !d.media.video, commercialContentOwnBrand: false, commercialContentThirdParty: false } } : {}),
    ...(d.platform === "linkedin" ? { linkedinData: { type: "post", previewIncluded: true, ...(images.length > 1 && !d.media.video ? { publishImagesAsPDF: true, documentTitle: d.title.slice(0, 100) } : {}) } } : {}),
  };
}

export type Result = { platform: Platform; account?: string; ok: boolean; post_id?: string; url?: string; warning?: string; error?: string; status?: string; detail?: string };

type Posted = { id?: number | string; uuid?: string; providers?: { network?: string; status?: string; publicUrl?: string; detailedStatus?: string }[] };
export async function createPost(brandId: string, body: unknown) {
  const r = await mc<{ data?: Posted } & Posted>("/v2/scheduler/posts", { method: "POST", blogId: brandId, body });
  const d = r?.data ?? r;
  if (d?.id === undefined || d?.id === null) throw new Error("Metricool didn't return the post it made.");
  return { id: String(d.id), uuid: d.uuid, post_url: d.providers?.find((p) => p.publicUrl)?.publicUrl, warning: undefined as string | undefined };
}

// Metricool's states, in the words the team reads.
const STATE: Record<string, string> = { PENDING: "scheduled", PUBLISHED: "published", PUBLISHING: "publishing", ERROR: "failed", DRAFT: "draft", AWAITING_CONFIRMATION: "waiting for you to publish it from the Metricool app" };

// A post's state now (scheduled, published, failed...) plus its error, if any. A post edited inside Metricool gets a new
// id there, so a missing post says so instead of failing.
export async function postStatus(brandId: string, id: string) {
  try {
    const r = await mc<{ data?: Posted } & Posted>(`/v2/scheduler/posts/${encodeURIComponent(id)}`, { blogId: brandId });
    const pr = (r?.data ?? r)?.providers ?? [];
    const raw = pr[0]?.status ?? "";
    return { status: STATE[raw] ?? raw.toLowerCase(), detail: pr.map((p) => p.detailedStatus).filter(Boolean).join("; "), link: pr.find((p) => p.publicUrl)?.publicUrl };
  } catch (e) {
    if (/Metricool 404/.test(String(e))) return { status: "not found", detail: "Edited or deleted inside Metricool, so it has a new id there.", link: undefined };
    throw e;
  }
}

export const why = (p: Platform, kind: string) =>
  p === "youtube" ? `${LABEL[p]} needs a video` : p === "tiktok" ? `${LABEL[p]} needs a video or at least 2 images` : p === "instagram" ? `${LABEL[p]} needs a video or images` : `${LABEL[p]} can't take this ${kind}`;
