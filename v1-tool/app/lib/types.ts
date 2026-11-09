import type { Handles } from "./guests";

export type Check = { id: string; pass: boolean; note: string };
export type Fix = { where: string; problem: string; before: string; after: string };
export type Review = { verdict: "ready" | "fix" | "rethink"; score: number; headline: string; checks: Check[]; fixes: Fix[]; question: string; hooks: string[]; at: string; usage?: { input: number; output: number } };
export type Note = { id: string; author: string; kind: string; body: string; meta: Record<string, unknown>; created_at: string };
// The Moment Coach's case for an idea it found (lib/moments.ts): 0 to 10 on each, weighted to a score out of 100.
export type Scores = { hook: number; smart: number; ip: number; icp: number; standalone: number };
// below_bar: under the usual bar (55), on the board because its level was short (lib/moments.ts BACKUP)
export type Moment = { score: number; scores: Scores; speaker: string; quote: string; angle: string; verdict: string; ip_name: string; icp_pain: string; service: string; cta: string; needs_take: boolean; scout: number; at: string; below_bar?: boolean;
  // brain: the training-material documents a carousel or post is built out with (lib/moments.ts BUILD_OUT)
  brain?: string[] };
// Where a scheduled piece's files went in Google Drive.
export type DriveSave = { at: string; folder?: string; url?: string; files: { name: string; id: string }[]; error?: string };
// The caption or post being written on its own (lib/copy.ts claims it for up to 30 minutes).
export const drafting = (p: { kind: string; body: string | null; caption?: string | null; captions?: Record<string, string> | null; copy_since?: string | null }) =>
  !!p.copy_since && Date.now() - new Date(p.copy_since).getTime() < 30 * 60000 && !(p.kind === "post" ? p.body?.trim() : p.caption?.trim() || Object.keys(p.captions ?? {}).length);
export type ViewPiece = {
  id: string; episode_id: string; num: number; kind: string; title: string; hook: string | null; source_time: string | null; source_end?: string | null; why: string | null;
  status: string; body: string | null; caption?: string | null; captions?: Record<string, string> | null; lead_magnet_id?: string | null; editor_notes?: string | null; outline?: string | null; review: Review | null; moment?: Moment | null;
  copy_since?: string | null; copy_failed?: number | null;
  // the awareness stage it's built for, its funnel position and the core insight it comes from (lib/stages.ts)
  awareness?: string | null; funnel?: string | null; insight?: string | null;
  media: { animated?: boolean; render?: string; rendered?: string; cover?: string; image?: string; card?: { line: string; look: string; at: string }; drive?: DriveSave; cs?: { at: string; mode: string; results: { platform: string; account?: string; ok: boolean; post_id?: string; url?: string; warning?: string; error?: string; status?: string; detail?: string }[] }; render_status?: string; render_error?: boolean; reviewing_since?: string; changing?: { reply: string; at: string }; plan?: string; video?: string; sheet?: string; clip?: string; cut?: { source: string; start: number; end: number; width: number; height: number }; slides?: string[]; usage?: { input: number; output: number }; no_collab?: boolean;
    // set by the daily cleanup (lib/retention.ts) once a posted piece's files are cleared
    retention?: { at: string; removed: string[]; drive?: string | null };
    // scheduled by hand in another tool through the posting kit (lib/postkit.ts)
    handoff?: { at: string; by: string; tool: string } };
  channels: string[]; scheduled_at: string | null; image_url?: string | null; video_url?: string | null; cover_url?: string | null; sheet_url?: string | null; clip_url?: string | null; slide_urls?: string[]; studio_episodes?: { title: string; guest: string | null; guest_handles?: Handles | null; link?: string | null; kind?: string | null };
  answer?: { body: string; author: string; at: string } | null;
};
