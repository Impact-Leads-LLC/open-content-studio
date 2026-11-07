import { loadShow, loadEpisodes, fileUrl, feedUrl } from "../../../../lib/podcast-server";
import { live, notesHtml, descriptionHtml } from "../../../../lib/podcast";

// Public: what the owner's website needs to turn each published episode into a blog page (the video-blog generator's input).
// Only what's already public in the feed goes out here; drafts and scheduled episodes stay private.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("show") ?? undefined;
    const show = await loadShow(slug);
    if (!show) return Response.json({ error: "No podcast yet." }, { status: 404 });
    const episodes = (await loadEpisodes(show.id)).filter((e) => live(e));
    const body = {
      show: {
        title: show.title, slug: show.slug, author: show.author, website: show.website, feed_url: feedUrl(show),
        description: show.description, description_html: notesHtml(show.description),
        artwork_url: show.artwork_path ? fileUrl(show.artwork_path) : null,
        categories: show.categories,
        listen_on: Object.fromEntries(Object.entries(show.platforms).filter(([, p]) => p.url).map(([k, p]) => [k, p.url])),
      },
      episodes: episodes.map((e) => ({
        guid: e.guid, slug: e.slug, title: e.title, summary: e.summary, notes: e.notes, notes_html: descriptionHtml(e),
        published_at: e.published_at, season: e.season, number: e.number, episode_type: e.episode_type, duration: e.duration,
        audio_url: fileUrl(e.audio_path!), audio_type: e.audio_type, audio_bytes: e.audio_bytes,
        artwork_url: fileUrl(e.artwork_path ?? show.artwork_path ?? ""), transcript_url: e.transcript_path ? fileUrl(e.transcript_path) : null,
        guest: e.guest, guest_url: e.guest_url, youtube_url: e.youtube_url, blog_url: e.blog_url, tags: e.tags,
      })),
    };
    return Response.json(body, { headers: { "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400", "access-control-allow-origin": "*" } });
  } catch (e) {
    console.error("site podcast json failed:", String(e).slice(0, 300));
    return Response.json({ error: "Try again shortly." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
