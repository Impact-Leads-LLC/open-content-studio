import { createSign } from "node:crypto";
import { db, storage, sign, fileKind, safeError } from "./supabase";
import { clipName, postDay } from "./naming";
import { LABEL, captionFor, ownCaptions, platformsFor } from "./platforms";
import type { Piece } from "./pieces";
import type { DriveSave } from "./types";
import { BRAND, COACH, TIMEZONE, TZ_LABEL } from "./brand";

// The Google Drive copy of every scheduled piece: the finished files land in a shared drive, one
// folder per show and episode, named by lib/naming.ts and tagged in their description with what they are. Needs
// GOOGLE_DRIVE_KEY (the JSON key of a service account that's a Content manager on the shared drive; a service account
// can't own files in someone's My Drive) and DRIVE_FOLDER_ID (the folder everything goes in).
const clean = (v?: string) => v?.replace(/\s+/g, "") || "";
const folderId = () => clean(process.env.DRIVE_FOLDER_ID).replace(/^.*\/folders\//, "").replace(/[?#].*$/, "");
export const driveReady = () => !!process.env.GOOGLE_DRIVE_KEY?.trim() && !!folderId();

function serviceKey() {
  let k: { client_email?: string; private_key?: string };
  try { k = JSON.parse(process.env.GOOGLE_DRIVE_KEY!.trim()); } catch { throw new Error("GOOGLE_DRIVE_KEY isn't the service account's JSON key. Paste the whole file's contents in the Vercel project settings."); }
  if (!k.client_email || !k.private_key) throw new Error("GOOGLE_DRIVE_KEY is missing client_email or private_key.");
  return { email: k.client_email, key: k.private_key.replace(/\\n/g, "\n") };
}

let cached: { token: string; until: number } | null = null;
async function token() {
  if (cached && cached.until > Date.now() + 60000) return cached.token;
  const { email, key } = serviceKey();
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: email, scope: "https://www.googleapis.com/auth/drive", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }) });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`Google wouldn't sign the studio in (${j.error_description ?? j.error ?? r.status}).`);
  cached = { token: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

const API = "https://www.googleapis.com/drive/v3";
const UP = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
async function g<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, { method: init.method ?? "GET", headers: { authorization: `Bearer ${await token()}`, ...(init.body ? { "content-type": "application/json" } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`Google Drive ${r.status}: ${j.error?.message ?? r.statusText}`);
  return j;
}
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
async function find(parent: string, name: string, folder = false) {
  const q = `'${parent}' in parents and name = '${esc(name)}' and trashed = false${folder ? ` and mimeType = '${FOLDER}'` : ""}`;
  const j = await g<{ files?: { id: string }[] }>(`/files?supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id)&q=${encodeURIComponent(q)}`);
  return j.files?.[0]?.id;
}
const folder = async (parent: string, name: string) => (await find(parent, name, true)) ?? (await g<{ id: string }>("/files?supportsAllDrives=true&fields=id", { method: "POST", body: { name, mimeType: FOLDER, parents: [parent] } })).id;

// One file into a folder, replacing a file of the same name. Storage files go up in 32 MB pieces (a full episode can
// be gigabytes), read from storage piece by piece so nothing big sits in memory.
const CHUNK = 32 * 1024 * 1024;
async function put(parent: string, name: string, src: { url?: string; text?: string }, type: string, description: string) {
  const existing = await find(parent, name);
  const start = await fetch(`${UP}/files${existing ? `/${existing}` : ""}?uploadType=resumable&supportsAllDrives=true&fields=id`, {
    method: existing ? "PATCH" : "POST",
    headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": type },
    body: JSON.stringify(existing ? { description } : { name, parents: [parent], description }),
  });
  const loc = start.headers.get("location");
  if (!start.ok || !loc) throw new Error(`Google Drive ${start.status} starting ${name}.`);
  const done = async (r: Response) => { const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }; if (!r.ok || !j.id) throw new Error(`Google Drive ${r.status} on ${name}: ${j.error?.message ?? r.statusText}`); return j.id; };
  if (src.text !== undefined) return done(await fetch(loc, { method: "PUT", headers: { "content-type": type }, body: src.text }));
  let off = 0, size = -1;
  for (;;) {
    const r = await fetch(src.url!, { headers: { range: `bytes=${off}-${off + CHUNK - 1}` } });
    if (r.status !== 206 && r.status !== 200) throw new Error(`Couldn't read ${name} from storage (${r.status}).`);
    const buf = Buffer.from(await r.arrayBuffer());
    // storage sent the whole file at once
    if (r.status === 200) return done(await fetch(loc, { method: "PUT", headers: { "content-type": type }, body: buf }));
    if (size < 0) size = Number((r.headers.get("content-range") ?? "").split("/")[1]);
    const end = off + buf.length - 1;
    const up = await fetch(loc, { method: "PUT", headers: { "content-range": `bytes ${off}-${end}/${size}` }, body: buf });
    if (up.status === 308) { off = end + 1; continue; }
    return done(up);
  }
}

const ext = (p: string, d: string) => (p.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? d).toLowerCase();
const MIME: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", txt: "text/plain; charset=UTF-8" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: TIMEZONE, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) + ` ${TZ_LABEL}` : "no date");

type Row = Piece & { studio_episodes: { title: string; guest: string | null; show: string } };

// The text file that goes with each piece: when and where it goes out, and the words that go with it.
function details(p: Row) {
  const ep = p.studio_episodes, nets = platformsFor(p.kind, p.channels, !!p.media?.image);
  const own = ownCaptions(p.caption, p.captions);
  const head = [p.title, `Goes out: ${when(p.scheduled_at)}`, `On: ${nets.map((n) => LABEL[n]).join(", ")}`, `From: ${ep.show}${ep.guest ? `, guest ${ep.guest}` : ""} (${ep.title})`,
    p.review ? `${COACH}: ${p.review.verdict}, ${p.review.score}/100` : "", p.moment ? `Moment Coach: ${p.moment.score}/100` : ""].filter(Boolean).join("\n");
  if (p.kind === "post") return `${head}\n\n${p.body ?? ""}\n`;
  if (p.kind === "episode") return `${head}\n`;
  const caps = Object.entries(own).filter(([n]) => nets.includes(n as never)).map(([n, v]) => `\n\n${LABEL[n as keyof typeof LABEL]}'s own caption:\n${v}`).join("");
  return `${head}\n\nCaption (every network${nets.some((n) => captionFor(p.caption, p.captions, n) !== (p.caption ?? "").trim() && !own[n]) ? ", shortened where a network takes less" : ""}):\n${p.caption ?? ""}${caps}\n`;
}

// Copy a piece's finished files to Drive and record where they went. Errors are recorded on the piece, not thrown,
// because it runs after the piece is already scheduled.
export async function saveToDrive(id: string): Promise<DriveSave> {
  const sb = db();
  const at = new Date().toISOString();
  let out: DriveSave;
  try {
    if (!driveReady()) throw new Error("Google Drive isn't connected yet: GOOGLE_DRIVE_KEY and DRIVE_FOLDER_ID go in the Vercel project settings.");
    const { data, error } = await sb.from("studio_pieces").select("*, studio_episodes(title, guest, show)").eq("id", id).single();
    if (error) throw error;
    const p = data as Row, m = p.media ?? {}, ep = p.studio_episodes;
    const base = clipName(p, ep);
    // what goes: [file name, storage path or text, type]
    const files: { name: string; path?: string; text?: string }[] = [];
    if (p.kind === "reel") {
      if (!m.video) throw new Error("The reel has no video yet.");
      files.push({ name: `${base}.mp4`, path: m.video });
      if (m.cover) files.push({ name: `${base}_cover.${ext(m.cover, "jpg")}`, path: m.cover });
      files.push({ name: `${base}_caption.txt`, text: details(p) });
    } else if (p.kind === "carousel") {
      if (!m.slides?.length) throw new Error("The carousel has no slides yet.");
      m.slides.forEach((s, i) => files.push({ name: `${base}_slide-${String(i + 1).padStart(2, "0")}.${ext(s, "png")}`, path: s }));
      files.push({ name: `${base}_caption.txt`, text: details(p) });
    } else if (p.kind === "post") {
      files.push({ name: `${base}.txt`, text: details(p) });
      if (m.image) files.push({ name: `${base}_image.${ext(m.image, "jpg")}`, path: m.image });
    } else if (p.kind === "episode") {
      const { data: full } = await storage().list(`episodes/${p.episode_id}/full`, { limit: 20, sortBy: { column: "created_at", order: "desc" } });
      const v = (full ?? []).find((x) => x.id && fileKind(x.name) === "clip");
      if (!v) throw new Error("Upload the full episode video first.");
      files.push({ name: `${base}.${ext(v.name, "mp4")}`, path: `episodes/${p.episode_id}/full/${v.name}` });
      const thumb = (full ?? []).find((x) => x.name === `thumbnail-${v.name.replace(/\.[^.]+$/, "")}.jpg`);
      if (thumb) files.push({ name: `${base}_thumbnail.jpg`, path: `episodes/${p.episode_id}/full/${thumb.name}` });
      files.push({ name: `${base}_details.txt`, text: details(p) });
    }
    const show = await folder(folderId(), ep.show);
    const dir = await folder(show, ep.title.replace(/:\s*/g, " - ").replace(/[\\/]/g, "-"));
    // the tags, readable and searchable in Drive
    const tags = [BRAND, `${p.kind} #${p.num}`, ep.show, ep.guest ? `guest ${ep.guest}` : "", `goes out ${postDay(p.scheduled_at)}`, platformsFor(p.kind, p.channels, !!m.image).map((n) => LABEL[n]).join(", "), "scheduled"].filter(Boolean).join(" · ");
    const urls = await sign(files.filter((f) => f.path).map((f) => f.path!), 3 * 3600);
    const saved: DriveSave["files"] = [];
    for (const f of files) {
      const type = MIME[ext(f.name, "txt")] ?? "application/octet-stream";
      if (f.path && !urls[f.path]) throw new Error(`Couldn't find ${f.path} in storage.`);
      saved.push({ name: f.name, id: await put(dir, f.name, f.path ? { url: urls[f.path] } : { text: f.text }, type, tags) });
    }
    out = { at, folder: dir, url: `https://drive.google.com/drive/folders/${dir}`, files: saved };
  } catch (e) {
    out = { at, files: [], error: safeError(e) };
  }
  // merge into the media as it is now, so a ContentStudio update in the meantime isn't lost
  const { data: now } = await sb.from("studio_pieces").select("media").eq("id", id).single();
  await sb.from("studio_pieces").update({ media: { ...(now?.media ?? {}), drive: out } }).eq("id", id);
  await sb.from("studio_notes").insert({ piece_id: id, author: "Studio", kind: "note", body: out.error ? `Didn't save to Google Drive: ${out.error}` : `Saved ${out.files.length} file${out.files.length === 1 ? "" : "s"} to Google Drive: ${out.files.map((f) => f.name).join(", ")}.` });
  return out;
}

// The name a piece's files get, for the page.
export async function nameFor(id: string) {
  const { data } = await db().from("studio_pieces").select("kind, num, title, scheduled_at, studio_episodes(show, guest)").eq("id", id).single();
  const ep = (data as unknown as { studio_episodes: { show: string; guest: string | null } } | null)?.studio_episodes;
  return data && ep ? clipName(data as { kind: string; num: number; title: string; scheduled_at: string | null }, ep) : "";
}
