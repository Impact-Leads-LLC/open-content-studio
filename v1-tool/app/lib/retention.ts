import { db, storage, safeError, fileKind } from "./supabase";
import { driveReady, saveToDrive } from "./drive";
import { configured as schedulerReady, connection, postStatus } from "./scheduler";
import type { Piece } from "./pieces";

// Data retention (RETENTION.md). Once a piece went out at least RETENTION_DAYS ago (7 unless set), its media files leave
// storage: the render, the clip, the cover, the contact sheet, the slides, the post graphic, the voiceover and the
// thumbnails. When Google Drive is set up they're copied there first, and a failed copy keeps them for the next run.
// Once every piece of an episode went out or was killed, the episode's footage leaves too: the camera feeds, the full
// video, the produced episode and the word times (its transcript stays). Unposted work is never touched, the text rows
// stay, and every clearing is written in the piece's thread. The daily cron (/api/cron/retention, vercel.json) runs it.

const DAY = 864e5;
// "off" turns it off; a number of days otherwise (0 clears right after the post date).
export function retentionDays(): number | null {
  const raw = (process.env.RETENTION_DAYS ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "never" || raw === "false") return null;
  const n = Number(raw || 7);
  return Number.isFinite(n) && n >= 0 ? Math.min(3650, Math.floor(n)) : 7;
}

type Row = Piece & { media: Piece["media"] & { retention?: { at: string; removed: string[]; drive?: string | null }; retention_hold?: { at: string; reason: string }; vo?: { audio?: string }; thumb?: { renders?: { job?: string }[] } } };
export type RetentionReport = {
  days: number | null; dry: boolean; pieces: { id: string; title: string; removed: number; drive: string | null }[];
  held: { id: string; title: string; reason: string }[]; episodes: { id: string; title: string; removed: number }[]; errors: string[];
};

// A piece went out when the scheduler took it as a scheduled post (or someone marked it posted) and its date has passed.
const wentOut = (p: Row) => p.status === "posted" || (p.status === "scheduled" && ((p.media?.cs?.mode === "scheduled" && p.media.cs.results.some((r) => r.ok)) || !!p.media?.handoff));

// Every file under a storage folder (Supabase lists one level at a time; folders come back without an id).
async function listAll(prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage().list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const f of data ?? []) {
      if (f.id) out.push(`${prefix}/${f.name}`);
      else out.push(...(await listAll(`${prefix}/${f.name}`)));
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

// The files a piece's media points to.
const refs = (m: Row["media"] | null | undefined) => [m?.video, m?.cover, m?.sheet, m?.clip, m?.image, m?.vo?.audio, ...(m?.slides ?? [])].filter((x): x is string => !!x);

// The files a piece's media points to, plus its own folder (voiceovers) and its thumbnail renders.
async function pieceFiles(p: Row) {
  const m = p.media ?? {};
  const paths = new Set<string>(refs(m));
  for (const f of await listAll(`pieces/${p.id}`).catch(() => [])) paths.add(f);
  for (const r of m.thumb?.renders ?? []) {
    if (!r.job) continue;
    for (const f of await listAll(`renders/${r.job}`).catch(() => [])) if (fileKind(f) === "image") paths.add(f);
  }
  return [...paths];
}

async function remove(paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await storage().remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}

// The scheduler says a post failed: then the piece didn't go out, and its files stay.
async function failedOut(p: Row) {
  if (!schedulerReady()) return "";
  const conn = await connection().catch(() => null);
  if (!conn) return "";
  for (const r of p.media?.cs?.results ?? []) {
    if (!r.ok || !r.post_id) continue;
    const s = await postStatus(conn, r.post_id).catch(() => null);
    if (s && /fail|error/i.test(s.status)) return `${r.platform} says the post ${s.status}${s.detail ? ` (${s.detail})` : ""}`;
  }
  return "";
}

export async function runRetention(opts: { dry?: boolean; now?: number } = {}): Promise<RetentionReport> {
  const days = retentionDays();
  const report: RetentionReport = { days, dry: !!opts.dry, pieces: [], held: [], episodes: [], errors: [] };
  if (days === null) return report;
  const sb = db();
  const now = opts.now ?? Date.now();
  const cutoff = new Date(now - days * DAY).toISOString();
  const at = new Date(now).toISOString();

  // 1. Pieces that went out at least `days` ago and still hold files.
  const { data, error } = await sb.from("studio_pieces").select("id, episode_id, num, kind, title, status, media, scheduled_at")
    .in("status", ["scheduled", "posted"]).not("scheduled_at", "is", null).lte("scheduled_at", cutoff).limit(500);
  if (error) throw error;
  const due = ((data ?? []) as unknown as Row[]).filter((p) => !p.media?.retention && wentOut(p));
  // A file another piece still uses (an episode image picked for two posts) stays until that piece is cleared too.
  const { data: all, error: e0 } = await sb.from("studio_pieces").select("id, media").limit(10000);
  if (e0) throw e0;
  const dueIds = new Set(due.map((p) => p.id));
  const inUse = new Set(((all ?? []) as Row[]).filter((x) => !dueIds.has(x.id) && !x.media?.retention).flatMap((x) => refs(x.media)));
  for (const p of due) {
    const hold = async (reason: string) => {
      report.held.push({ id: p.id, title: p.title, reason });
      if (opts.dry || p.media?.retention_hold?.reason === reason) return;
      await sb.from("studio_pieces").update({ media: { ...p.media, retention_hold: { at, reason } } }).eq("id", p.id);
      await sb.from("studio_notes").insert({ piece_id: p.id, author: "Studio", kind: "note", body: `Kept this piece's files for now: ${reason}. The daily cleanup tries again tomorrow.` });
    };
    try {
      const failed = await failedOut(p);
      if (failed) { await hold(failed); continue; }
      const files = (await pieceFiles(p)).filter((f) => !inUse.has(f));
      // a copy in Drive first, when Drive is set up and this piece doesn't have one yet
      let drive: string | null = p.media?.drive?.url && !p.media.drive.error ? p.media.drive.url : null;
      if (files.length && driveReady() && !drive && !opts.dry) {
        const saved = await saveToDrive(p.id);
        if (saved.error) { await hold(`the Google Drive copy failed (${saved.error})`); continue; }
        drive = saved.url ?? null;
      }
      report.pieces.push({ id: p.id, title: p.title, removed: files.length, drive });
      if (opts.dry) continue;
      if (files.length) await remove(files);
      // re-read the media, so a Drive save or a status check in the meantime isn't lost
      const { data: cur } = await sb.from("studio_pieces").select("media").eq("id", p.id).single();
      const media = { ...((cur?.media as Row["media"]) ?? p.media) };
      delete media.retention_hold;
      media.retention = { at, removed: files, drive };
      await sb.from("studio_pieces").update({ media, status: "posted", updated_at: at }).eq("id", p.id);
      await sb.from("studio_notes").insert({
        piece_id: p.id, author: "Studio", kind: "note",
        body: files.length
          ? `Cleared ${files.length} file${files.length === 1 ? "" : "s"} from storage, ${days} day${days === 1 ? "" : "s"} after it went out (RETENTION_DAYS).${drive ? ` Copies are in Google Drive: ${drive}` : " Google Drive isn't set up, so there is no copy."} The text stays here.`
          : "Marked as posted. It had no files left in storage.",
        meta: { retention: { removed: files, drive } },
      });
    } catch (e) {
      report.errors.push(`${p.title}: ${safeError(e)}`);
    }
  }

  // 2. Episodes whose every piece went out (and was cleared) or was killed: their footage goes too.
  const { data: eps, error: e2 } = await sb.from("studio_episodes").select("id, title, archived_at, studio_pieces(id, kind, status, media, scheduled_at)").is("archived_at", null).limit(500);
  if (e2) throw e2;
  for (const ep of (eps ?? []) as unknown as { id: string; title: string; studio_pieces: Row[] }[]) {
    const ps = ep.studio_pieces ?? [];
    if (!ps.length || !ps.every((x) => x.status === "skipped" || (x.status === "posted" && x.media?.retention))) continue;
    const last = Math.max(...ps.filter((x) => x.scheduled_at).map((x) => Date.parse(x.scheduled_at!)), 0);
    if (!last || last > Date.parse(cutoff)) continue;
    try {
      const files = (await listAll(`episodes/${ep.id}`)).filter((f) => fileKind(f) !== "transcript");
      report.episodes.push({ id: ep.id, title: ep.title, removed: files.length });
      if (opts.dry) continue;
      if (files.length) await remove(files);
      await sb.from("studio_episodes").update({ archived_at: at }).eq("id", ep.id);
      const where = ps.find((x) => x.kind === "episode" && x.status !== "skipped") ?? ps.find((x) => x.status !== "skipped") ?? ps[0];
      await sb.from("studio_notes").insert({
        piece_id: where.id, author: "Studio", kind: "note",
        body: files.length ? `Every piece of this episode went out or was killed, so its footage left storage: ${files.length} file${files.length === 1 ? "" : "s"} (camera feeds, the full video, the produced episode). The transcript stays.` : "Every piece of this episode went out or was killed. It had no footage left in storage.",
        meta: { retention: { removed: files } },
      });
    } catch (e) {
      report.errors.push(`${ep.title}: ${safeError(e)}`);
    }
  }
  return report;
}
