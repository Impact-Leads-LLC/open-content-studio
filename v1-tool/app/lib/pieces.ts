import { after } from "next/server";
import { db, sign, storage } from "./supabase";
import { coverPath, deckPlan, deckSheet, deckSlide, isDeck, planPath, renderPath, renderStatus, sheetPath } from "./render";
import { reviewQuietly } from "./coach";
import { claimCopy, draftCopy } from "./copy";

import type { Review, Moment, DriveSave } from "./types";

export type Cut = { source: string; start: number; end: number; width: number; height: number };
// What went to the scheduler: one post per network, as drafts or scheduled.
export type CsSend = { at: string; mode: "draft" | "scheduled"; results: { platform: string; account?: string; ok: boolean; post_id?: string; url?: string; warning?: string; error?: string; status?: string; detail?: string }[] };
// chapters and srt: the produced full episode's YouTube chapters and captions file (the episode route's episodeMade)
// handoff: posted through another scheduler by hand (lib/postkit.ts), so the cleanup knows it went out
export type Media = { handoff?: { at: string; by: string; tool: string }; animated?: boolean; chapters?: string; srt?: string; video?: string; cover?: string; image?: string; card?: PostCard; cs?: CsSend; drive?: DriveSave; sheet?: string; plan?: string; clip?: string; cut?: Cut; render?: string; rendered?: string; render_status?: string; render_error?: boolean; reviewing_since?: string; changing?: { reply: string; at: string }; slides?: string[]; usage?: { input: number; output: number }; no_collab?: boolean;
  // set by the daily cleanup (lib/retention.ts) once a posted piece's files are cleared
  retention?: { at: string; removed: string[]; drive?: string | null } };
// A text post's branded graphic (lib/postcard.tsx): its words, its look and when it was made; media.image is the file.
export type PostCard = { line: string; look: string; at: string };
export type Piece = {
  id: string; episode_id: string; num: number; kind: string; title: string; hook: string | null; source_time: string | null; source_end: string | null;
  why: string | null; status: string; body: string | null; caption?: string | null; captions?: Record<string, string> | null; lead_magnet_id?: string | null; editor_notes?: string | null; outline?: string | null; media: Media; channels: string[]; scheduled_at: string | null; review: Review | null; moment?: Moment | null;
  // the caption or post being written on its own (lib/copy.ts)
  copy_since?: string | null; copy_failed?: number | null;
  // the awareness stage it's built for, its funnel position and the core insight it comes from (lib/stages.ts)
  awareness?: string | null; funnel?: string | null; insight?: string | null;
};

// A reel being rendered or a carousel being built: check the cloud machine and record the result once it's done. A
// finished piece goes straight on to the coach, so the team opens it with the review already there.
export async function refresh(p: Piece): Promise<Piece> {
  const m = p.media;
  // a reel being changed keeps showing its last version while the new one renders
  if (!m?.render || m.render_error || m.rendered === m.render || (m.video && !isDeck(m.render) && p.status !== "making")) return p;
  const id = m.render;
  const s = await renderStatus(id);
  const media: Media = { ...m, render_status: s.status };
  const patch: Partial<Piece> = { media };
  if (s.done && s.ok && isDeck(id)) {
    // the deck file says how many slides came back (up to 10)
    const f = await storage().download(deckPlan(id));
    const count = f.data ? Number(JSON.parse(await f.data.text()).count) || 0 : 0;
    Object.assign(media, { slides: Array.from({ length: count }, (_, i) => deckSlide(id, i + 1)), sheet: deckSheet(id), plan: deckPlan(id), rendered: id, reviewing_since: new Date().toISOString() });
    patch.status = count ? "draft" : "kept";
    if (!count) media.render_error = true;
  } else if (s.done && s.ok) Object.assign(media, { video: renderPath(id), cover: coverPath(id), sheet: sheetPath(id), plan: planPath(id), rendered: id, reviewing_since: new Date().toISOString() }), patch.status = "draft", patch.review = null;
  // a failed rebuild keeps the slides or reel the piece already had
  if (s.done && !s.ok) { media.render_error = true; patch.status = m.slides?.length || m.video ? "draft" : "kept"; }
  if (s.done) {
    // Only the request that records the finish follows it up, so two open tabs don't review it twice.
    const sb = db(), at = new Date().toISOString();
    const { data } = await sb.from("studio_pieces").update({ ...patch, updated_at: at }).eq("id", p.id).eq("status", "making").select("id");
    if (data?.length && s.ok && patch.status === "draft") after(() => finished(p.id, media.plan ?? planPath(id)));
    if (!data?.length) { delete media.reviewing_since; await sb.from("studio_pieces").update({ media, updated_at: at }).eq("id", p.id); }
  }
  return { ...p, ...patch, media };
}

// After a render: the editor's note on its choices goes in the team's thread, then the coach reviews the reel.
async function finished(pieceId: string, plan: string) {
  try {
    const f = await storage().download(plan);
    const note = f.data ? String(JSON.parse(await f.data.text()).notes ?? "").trim() : "";
    if (note) await db().from("studio_notes").insert({ piece_id: pieceId, author: "Editor", kind: "note", body: note });
  } catch { /* the plan is a nice-to-have */ }
  // A piece without its caption yet (its idea came before captions wrote themselves) gets one now, so the coach
  // reviews them together. Claimed like every other draft, so the next look at the episode doesn't start a second one.
  try {
    if ((await claimCopy([pieceId])).ids.length) await draftCopy(pieceId);
  } catch { /* draftCopy leaves its own note in the thread */ }
  await reviewQuietly(pieceId, "after it was made");
}

// Add private links for the piece's video and slides.
export async function withUrls<T extends Piece>(pieces: T[]) {
  const urls = await sign(pieces.flatMap((p) => [p.media?.video ?? "", p.media?.cover ?? "", p.media?.sheet ?? "", p.media?.clip ?? "", p.media?.image ?? "", ...(p.media?.slides ?? [])]));
  return pieces.map((p) => ({
    ...p,
    image_url: p.media?.image ? urls[p.media.image] ?? null : null,
    video_url: p.media?.video ? urls[p.media.video] ?? null : null,
    cover_url: p.media?.cover ? urls[p.media.cover] ?? null : null,
    clip_url: p.media?.clip ? urls[p.media.clip] ?? null : null,
    sheet_url: p.media?.sheet ? urls[p.media.sheet] ?? null : null,
    slide_urls: (p.media?.slides ?? []).map((s) => urls[s]).filter(Boolean),
  }));
}
