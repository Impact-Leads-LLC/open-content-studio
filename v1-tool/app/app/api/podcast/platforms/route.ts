import { safeError } from "../../../../lib/supabase";
import { loadShow, loadEpisodes, feedUrl } from "../../../../lib/podcast-server";
import { live } from "../../../../lib/podcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bare = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();

// Apple's public directory says which feed it reads and how many episodes it has, so the page can show whether Apple
// follows this feed and has caught up. The others have no public lookup; their rows are links.
export async function GET(req: Request) {
  try {
    const show = await loadShow(new URL(req.url).searchParams.get("show") || undefined);
    if (!show) return Response.json({ apple: null });
    const id = show.platforms.apple?.url?.match(/id(\d{6,})/)?.[1];
    if (!id) return Response.json({ apple: null });
    const r = await fetch(`https://itunes.apple.com/lookup?id=${id}&entity=podcast`, { cache: "no-store" });
    const hit = r.ok ? ((await r.json()).results ?? [])[0] : null;
    if (!hit) return Response.json({ apple: { found: false } });
    const ours = feedUrl(show);
    const count = (await loadEpisodes(show.id)).filter((e) => live(e)).length;
    return Response.json({
      apple: {
        found: true, feed: hit.feedUrl as string, follows: bare(hit.feedUrl ?? "") === bare(ours),
        episodes: hit.trackCount as number, ours: count, latest: hit.releaseDate as string,
      },
    });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
