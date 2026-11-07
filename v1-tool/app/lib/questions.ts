import { db } from "./supabase";
import { withUrls, type Piece } from "./pieces";
import type { Review } from "./types";

type Asked = Piece & { review: Review; studio_episodes?: { title: string; guest: string | null; kind?: string | null } };
const LIVE = ["draft", "changes", "ready"];
const ms = (t: string) => new Date(t).getTime();

// The coach's questions still waiting on the owner: asked in the piece's latest review, not answered or dropped since.
export async function openQuestions(full = false) {
  const sb = db();
  const { data, error } = await sb.from("studio_pieces").select(full ? "*, studio_episodes(title, guest, kind)" : "id, status, review").in("status", LIVE).not("review", "is", null);
  if (error) throw error;
  const asked = ((data ?? []) as unknown as Asked[]).filter((p) => p.review?.question?.trim());
  if (!asked.length) return [];
  const { data: notes, error: e2 } = await sb.from("studio_notes").select("piece_id, created_at").in("kind", ["answer", "drop"]).in("piece_id", asked.map((p) => p.id));
  if (e2) throw e2;
  const open = asked.filter((p) => !(notes ?? []).some((n) => n.piece_id === p.id && ms(n.created_at) > ms(p.review.at)));
  if (!full) return open;
  return withUrls(open.sort((a, b) => a.episode_id.localeCompare(b.episode_id) || a.num - b.num));
}

// The owner's latest answer on each piece, for the team.
export async function latestAnswers(ids: string[]) {
  if (!ids.length) return {} as Record<string, { body: string; author: string; at: string }>;
  const { data, error } = await db().from("studio_notes").select("piece_id, body, author, created_at").eq("kind", "answer").in("piece_id", ids).order("created_at");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((n) => [n.piece_id, { body: n.body, author: n.author, at: n.created_at }]));
}
