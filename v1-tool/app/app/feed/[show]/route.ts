import { buildFeed } from "../../../lib/podcast-feed";
import { loadShow, loadEpisodes, fileUrl, feedUrl } from "../../../lib/podcast-server";

// The public RSS feed (/feed/<show>.xml): the one address Apple, Spotify and every app read. No sign-in. The CDN keeps
// a copy for 5 minutes, so a burst of apps checking at once costs one database read.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function feed(params: Promise<{ show: string }>) {
  const { show: raw } = await params;
  const show = await loadShow(raw.replace(/\.(xml|rss)$/i, "").toLowerCase());
  if (!show) return new Response("No podcast here.", { status: 404, headers: { "content-type": "text/plain" } });
  const xml = buildFeed(show, await loadEpisodes(show.id), { feed: feedUrl(show), file: fileUrl });
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
      "access-control-allow-origin": "*",
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ show: string }> }) {
  try {
    return await feed(params);
  } catch (e) {
    console.error("feed failed:", String(e).slice(0, 300));
    return new Response("The feed is having a moment. Try again shortly.", { status: 503, headers: { "content-type": "text/plain", "cache-control": "no-store", "retry-after": "60" } });
  }
}

// Some apps check the feed with HEAD before reading it.
export async function HEAD(req: Request, ctx: { params: Promise<{ show: string }> }) {
  const r = await GET(req, ctx);
  return new Response(null, { status: r.status, headers: r.headers });
}
