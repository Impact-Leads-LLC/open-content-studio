import { db } from "./supabase";
import type { Guest, Handles } from "./guests";

// The episode's guest (name and handles, for tagging) and its own link, for a caption's next step and the first
// comment: the link the team put on the episode, else the published episode's YouTube video, else its blog post.
export async function episodeExtras(episodeId: string): Promise<{ guest: Guest; link: string | null }> {
  const sb = db();
  const [{ data: ep }, { data: pod }] = await Promise.all([
    sb.from("studio_episodes").select("guest, guest_handles, link").eq("id", episodeId).maybeSingle(),
    sb.from("studio_podcast_episodes").select("youtube_url, blog_url").eq("episode_id", episodeId).limit(1).maybeSingle(),
  ]);
  const e = ep as { guest: string | null; guest_handles: Handles | null; link: string | null } | null;
  const p = pod as { youtube_url: string | null; blog_url: string | null } | null;
  return { guest: { name: e?.guest ?? null, handles: e?.guest_handles ?? {} }, link: e?.link || p?.youtube_url || p?.blog_url || null };
}
