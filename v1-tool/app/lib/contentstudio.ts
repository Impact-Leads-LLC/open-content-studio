import { LABEL, type Platform } from "./platforms";

// ContentStudio.io, one of the two schedulers (lib/scheduler.ts picks it with SCHEDULER=contentstudio). Public API (OpenAPI at api-prod.contentstudio.io/api-docs.json, read 2026-10-28):
// header X-API-Key, POST /api/v1/workspaces/{ws}/posts with content.text + content.media, accounts[], post_type,
// scheduling.publish_type (draft | scheduled | queued). We send one post per network, so each gets its own post type,
// caption, media and cover, and a rejection names the network it came from.
const clean = (v?: string) => v?.replace(/\s+/g, "") || "";
const base = () => (clean(process.env.CONTENTSTUDIO_API_BASE) || "https://api.contentstudio.io").replace(/\/$/, "");
export const configured = () => !!clean(process.env.CONTENTSTUDIO_API_KEY);

// ContentStudio's error text, with anything shaped like the key taken out before it reaches the page.
function redact(s: string) {
  const key = clean(process.env.CONTENTSTUDIO_API_KEY);
  return key && key.length > 6 ? s.split(key).join("[key]") : s;
}

async function cs<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = clean(process.env.CONTENTSTUDIO_API_KEY);
  if (!key) throw new Error("Add CONTENTSTUDIO_API_KEY in the Vercel project settings, then redeploy.");
  const r = await fetch(`${base()}${path}`, {
    method: init.method ?? "GET", cache: "no-store",
    headers: { "X-API-Key": key, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const body = (await r.json().catch(() => ({}))) as { status?: boolean; message?: string; errors?: Record<string, string[] | string> };
  if (!r.ok || body?.status === false) {
    const fields = body?.errors ? Object.entries(body.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : v}`).join("; ") : "";
    throw new Error(redact(`ContentStudio ${r.status}: ${body?.message ?? r.statusText}${fields ? ` (${fields})` : ""}`));
  }
  return body as T;
}

export type Workspace = { id: string; name?: string; timezone?: string };
export type Account = { id: string; platform: string; account_name?: string; status?: string };

// The workspace the posts go to. ContentStudio lists a key's workspaces in no fixed order (one key can see several
// brands), so the first one is a coin toss: use CONTENTSTUDIO_WORKSPACE_ID when it's set, else the only workspace with
// social accounts connected. Never guess between two brands.
// CONTENTSTUDIO_SKIP_WORKSPACES: names (or parts of names, comma separated) this studio must never post to, whatever the
// key can see; a key shared with another brand's workspace lists that brand here.
const skipList = () => (process.env.CONTENTSTUDIO_SKIP_WORKSPACES ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const skipped = (w: Workspace) => { const n = (w.name ?? "").toLowerCase(); return skipList().some((s) => n.includes(s)); };
export async function workspace(): Promise<Workspace> {
  const r = await cs<{ data: Workspace[] }>("/api/v1/workspaces?per_page=50");
  const all = (r.data ?? []).filter((w) => !skipped(w));
  const want = clean(process.env.CONTENTSTUDIO_WORKSPACE_ID);
  if (want) {
    const ws = all.find((w) => w.id === want);
    if (!ws) throw new Error(`CONTENTSTUDIO_WORKSPACE_ID isn't one of this key's ContentStudio workspaces${skipList().length ? " (or it's on CONTENTSTUDIO_SKIP_WORKSPACES)" : ""}.`);
    return ws;
  }
  if (all.length < 2) { if (!all[0]) throw new Error("The ContentStudio key has no workspace."); return all[0]; }
  const used = (await Promise.all(all.map(async (w) => ((await accounts(w.id)).length ? w : null)))).filter((w): w is Workspace => !!w);
  if (used.length === 1) return used[0];
  throw new Error(`The ContentStudio key sees ${used.length ? "several workspaces with accounts" : "no workspace with accounts"} (${all.map((w) => w.name ?? w.id).join(", ")}): set CONTENTSTUDIO_WORKSPACE_ID to the one this studio posts to.`);
}

export async function accounts(ws: string): Promise<Account[]> {
  const r = await cs<{ data: Account[] }>(`/api/v1/workspaces/${ws}/accounts?per_page=100`);
  return r.data ?? [];
}

// Where a network has more than one account, the one this studio posts to: SCHEDULER_PREFER_ACCOUNTS, like
// "facebook=Alex Rivera, linkedin=Alex Rivera Studio" (the account names as the scheduler shows them).
const PREFER = (): Partial<Record<Platform, string>> => Object.fromEntries((process.env.SCHEDULER_PREFER_ACCOUNTS ?? "").split(",")
  .map((x) => x.split("=").map((s) => s.trim())).filter(([k, v]) => k && v).map(([k, v]) => [k.toLowerCase(), v]));

// The account each of our networks posts to: the preferred one, else the first connected one by name, so it's the same
// one every time (the list comes back in no fixed order).
export function accountFor(list: Account[], p: Platform) {
  const mine = list.filter((a) => a.platform?.toLowerCase() === p).sort((a, b) => (a.account_name ?? a.id).localeCompare(b.account_name ?? b.id));
  return mine.find((a) => a.account_name === PREFER()[p]) ?? mine.find((a) => !a.status || a.status === "active") ?? mine[0];
}

export type Media = { video?: string; cover?: string; images?: string[] };
// collaborators: Instagram co-author invites (@handles, up to 3); firstComment: posted under it (LinkedIn, Facebook,
// Instagram, YouTube take one).
export type Draft = { platform: Platform; text: string; media: Media; title: string; kind: string; collaborators?: string[]; firstComment?: string };
export const FIRST_COMMENT: Platform[] = ["linkedin", "facebook", "instagram", "youtube"];

// What each network accepts, by what the piece is. null: the network can't take it (Instagram needs media; YouTube needs video).
export function postType(p: Platform, kind: string, m: Media): string | null {
  const many = (m.images?.length ?? 0) > 1, one = (m.images?.length ?? 0) === 1;
  if (p === "youtube") return m.video ? (kind === "episode" ? "video" : "shorts") : null;
  if (p === "instagram") return m.video ? "reel" : many ? "carousel" : one ? "feed" : null;
  if (p === "tiktok") return m.video ? "video" : many ? "carousel" : null;   // ContentStudio's TikTok photo posts take 2 or more
  if (p === "facebook") return m.video && kind !== "episode" ? "reel" : "feed";   // a full episode is a regular video post
  return "feed";   // LinkedIn (text, image, video; 2+ images become a PDF document carousel) and Threads
}

// One ContentStudio post for one network. Covers: Instagram, Facebook, LinkedIn video and YouTube regular videos take an
// image (our frame at 0.5 s); TikTok takes a time, so 500 ms; Shorts take neither.
export function buildPost(d: Draft, accountId: string, publish: "draft" | "scheduled", at?: string) {
  const type = postType(d.platform, d.kind, d.media)!;
  const images = d.media.images?.slice(0, 10);
  const thumb = !!d.media.cover && (["instagram", "facebook", "linkedin"].includes(d.platform) || (d.platform === "youtube" && type === "video"));
  const media = d.media.video ? { video: d.media.video, ...(thumb && d.media.cover ? { video_thumbnail: d.media.cover } : {}) } : images?.length ? { images } : undefined;
  const firstLine = d.text.split("\n").find((l) => l.trim())?.trim() ?? d.title;
  return {
    content: { text: d.text.slice(0, 5000), ...(media ? { media } : {}) },
    accounts: [accountId],
    post_type: type,
    scheduling: { publish_type: publish, ...(publish === "scheduled" && at ? { scheduled_at: at } : {}) },
    ...(d.platform === "tiktok" ? { tiktok_options: { privacy_level: "PUBLIC_TO_EVERYONE", ...(d.media.video ? { video_cover_timestamp_ms: 500 } : {}) } } : {}),
    // YouTube wants a title (100 characters at most) and the made-for-kids answer, which is always no
    ...(d.platform === "youtube" ? { youtube_options: { title: (firstLine || d.title).slice(0, 100), privacy_status: "public", category: "EDUCATION", made_for_kids: false } } : {}),
    ...(d.platform === "linkedin" && (images?.length ?? 0) > 1 ? { linkedin_options: { title: d.title.slice(0, 100) } } : {}),
    // the guest as co-author: once they accept, it shows on their profile too
    ...(d.platform === "instagram" && d.collaborators?.length ? { instagram_options: { collaborators: d.collaborators.slice(0, 3) } } : {}),
    ...(d.firstComment && FIRST_COMMENT.includes(d.platform) ? { first_comment: { message: d.firstComment.slice(0, 2000), accounts: [accountId] } } : {}),
  };
}

export type Result = { platform: Platform; account?: string; ok: boolean; post_id?: string; url?: string; warning?: string; error?: string; status?: string; detail?: string };

export async function createPost(ws: string, body: unknown) {
  const r = await cs<{ data: { id: string; post_url?: string; warning?: string } }>(`/api/v1/workspaces/${ws}/posts`, { method: "POST", body });
  return r.data;
}

// A post's state now: draft, scheduled, published, failed, partially_failed... plus each account's error, if any.
export async function postStatus(ws: string, id: string) {
  const r = await cs<{ data: { status?: string; accounts?: { platform?: string; posting_status?: string; error_message?: string; post_link?: string }[] } }>(`/api/v1/workspaces/${ws}/posts/${id}`);
  const acc = r.data?.accounts ?? [];
  return { status: r.data?.status ?? "", detail: acc.map((a) => [a.posting_status, a.error_message].filter(Boolean).join(": ")).filter(Boolean).join("; "), link: acc.find((a) => a.post_link)?.post_link };
}

// "2026-10-30 09:00:00" in the workspace's time zone (ContentStudio has no per-post time zone).
// ContentStudio reads the time in the workspace's own zone; without one it would be a guess, hours off.
export function wsTime(iso: string, tz?: string) {
  if (!tz) throw new Error("The ContentStudio workspace has no time zone set, so the post time would be off. Set it in ContentStudio, then schedule again.");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}:${g("second")}`;
}

export const why = (p: Platform, kind: string) =>
  p === "youtube" ? `${LABEL[p]} needs a video` : p === "tiktok" ? `${LABEL[p]} needs a video or at least 2 images` : p === "instagram" ? `${LABEL[p]} needs a video or images` : `${LABEL[p]} can't take this ${kind}`;
