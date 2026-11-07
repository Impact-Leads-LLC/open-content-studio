import { randomUUID } from "node:crypto";
import { db, safeError } from "../../../../lib/supabase";
import { actor } from "../../../../lib/auth";
import { slugify } from "../../../../lib/podcast";
import { loadShow, listShows, refreshJobs, studioSources, withUrls, feedUrl } from "../../../../lib/podcast-server";
import type { Episode } from "../../../../lib/podcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The podcast panel on a studio episode: its feed episode (if started), the files it can use, who can publish.
// The show is the one the feed episode is on; before that, the one the studio episode names, or the first show.
export async function GET(req: Request) {
  try {
    const studio = new URL(req.url).searchParams.get("studio") ?? "";
    if (!/^[0-9a-f-]{36}$/.test(studio)) return Response.json({ error: "Bad episode id." }, { status: 400 });
    const all = await listShows();
    if (!all.length) return Response.json({ show: null, shows: [] });
    const sb = db();
    const [{ data, error }, { data: st }] = await Promise.all([
      sb.from("studio_podcast_episodes").select("*").eq("episode_id", studio).order("created_at").limit(1),
      sb.from("studio_episodes").select("show").eq("id", studio).maybeSingle(),
    ]);
    if (error) throw error;
    const [ep] = await refreshJobs((data ?? []) as Episode[]);
    const show = (ep && all.find((s) => s.id === ep.show_id)) || all.find((s) => s.title === st?.show) || all[0];
    return Response.json({
      show: { title: show.title, slug: show.slug, feed_url: feedUrl(show) },
      shows: all.map((s) => ({ slug: s.slug, title: s.title })),
      episode: ep ? withUrls(ep) : null,
      sources: await studioSources(studio),
      can_publish: actor(req)?.role === "owner",
    });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

// Start the feed episode for a studio episode on the show picked: a draft with that show's next number, its title and
// guest carried over. The studio episode then carries the show's name too.
export async function POST(req: Request) {
  try {
    const { episode_id, show: wanted } = await req.json();
    if (!/^[0-9a-f-]{36}$/.test(episode_id ?? "")) return Response.json({ error: "Bad episode id." }, { status: 400 });
    const show = await loadShow(typeof wanted === "string" && wanted ? wanted : undefined);
    if (!show) return Response.json({ error: wanted ? "No such show." : "Set up the show on the Podcast page first." }, { status: 400 });
    const sb = db();
    const [{ data: st, error: se }, { data: rows, error: re }, { data: had }] = await Promise.all([
      sb.from("studio_episodes").select("title,guest").eq("id", episode_id).single(),
      sb.from("studio_podcast_episodes").select("slug,season,number,published_at").eq("show_id", show.id),
      sb.from("studio_podcast_episodes").select("id").eq("episode_id", episode_id).limit(1),
    ]);
    if (se || re) throw se ?? re;
    if (had?.length) return Response.json({ error: "This episode already has its podcast episode." }, { status: 409 });
    const taken = new Set((rows ?? []).map((r) => r.slug));
    const base = slugify(st.title);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    const latest = [...(rows ?? [])].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))[0];
    const season = latest?.season ?? 1;
    const number = Math.max(0, ...(rows ?? []).filter((r) => (r.season ?? 1) === season).map((r) => r.number ?? 0)) + 1;
    const { data, error } = await sb.from("studio_podcast_episodes").insert({
      show_id: show.id, episode_id, guid: randomUUID(), slug, title: st.title, guest: st.guest, season, number, status: "draft",
    }).select("*").single();
    if (error) throw error;
    await sb.from("studio_episodes").update({ show: show.title }).eq("id", episode_id);
    return Response.json({ episode: withUrls(data as Episode) });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
