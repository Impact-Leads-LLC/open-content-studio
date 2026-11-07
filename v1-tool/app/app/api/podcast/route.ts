import { db, safeError } from "../../../lib/supabase";
import { actor } from "../../../lib/auth";
import { checkFeed, slugify, CATEGORIES, type Category, type Show } from "../../../lib/podcast";
import { feedUrlFor } from "../../../lib/podcast-feed";
import { loadShow, listShows, showCard, podcastGuidFor, loadEpisodes, refreshJobs, startAudio, fileUrl, feedUrl, pstore, withUrls, FALLBACK_BASE } from "../../../lib/podcast-server";
import { OWNER, OWNER_FULL, WEBSITE } from "../../../lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Which show a request is about: ?show=<feed name>, or the first show.
const pick = (req: Request) => new URL(req.url).searchParams.get("show") || undefined;

// The podcast page: every show for the switcher, then one show with its episodes and feed check.
export async function GET(req: Request) {
  try {
    const slug = pick(req);
    const all = await listShows();
    const show = (slug ? all.find((s) => s.slug === slug) : all[0]) ?? null;
    const shows = all.map(showCard);
    if (!show) return Response.json({ show: null, shows, can_publish: actor(req)?.role === "owner" });
    const eps = await refreshJobs(await loadEpisodes(show.id));
    const ids = [...new Set(eps.map((e) => e.episode_id).filter(Boolean))] as string[];
    const { data: studio } = ids.length ? await db().from("studio_episodes").select("id,title").in("id", ids) : { data: [] };
    return Response.json({
      show, shows, artwork_url: show.artwork_path ? fileUrl(show.artwork_path) : null, feed_url: feedUrl(show), fallback_base: FALLBACK_BASE,
      episodes: eps.map(withUrls), studio: Object.fromEntries((studio ?? []).map((s) => [s.id, s.title])),
      checks: checkFeed(show, eps), can_publish: actor(req)?.role === "owner",
    });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

const TEXT = ["title", "author", "description", "language", "owner_name", "owner_email", "website", "copyright"] as const;

// Show settings. Where the feed lives, moving the show away and the lock are the owner's.
export async function PATCH(req: Request) {
  try {
    const me = actor(req);
    const show = await loadShow(pick(req));
    if (!show) return Response.json({ error: "No such show." }, { status: 404 });
    const b = await req.json();
    const patch: Partial<Show> & Record<string, unknown> = {};
    for (const k of TEXT) if (typeof b[k] === "string") patch[k] = b[k].trim();
    if (patch.owner_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.owner_email)) return Response.json({ error: "That owner email doesn't look right." }, { status: 400 });
    if (patch.website && !/^https:\/\//.test(patch.website)) return Response.json({ error: "The website needs to start with https://" }, { status: 400 });
    if (typeof b.explicit === "boolean") patch.explicit = b.explicit;
    if (typeof b.op3 === "boolean") patch.op3 = b.op3;
    if (b.show_type === "episodic" || b.show_type === "serial") patch.show_type = b.show_type;
    if (Array.isArray(b.categories)) {
      const cats = (b.categories as Category[]).filter((c) => c?.category).slice(0, 2);
      if (cats.some((c) => !(c.category in CATEGORIES) || (c.sub && !CATEGORIES[c.category].includes(c.sub)))) return Response.json({ error: "Pick categories from Apple's list." }, { status: 400 });
      patch.categories = cats.map((c) => (c.sub ? { category: c.category, sub: c.sub } : { category: c.category }));
    }
    if (typeof b.artwork_path === "string" && b.artwork_path.startsWith("art/")) patch.artwork_path = b.artwork_path;
    if (b.platforms && typeof b.platforms === "object") {
      patch.platforms = { ...show.platforms };
      for (const [k, v] of Object.entries(b.platforms as Record<string, { url?: string; note?: string }>)) {
        const url = String(v?.url ?? "").trim();
        if (url && !/^https:\/\//.test(url)) return Response.json({ error: "Listing links start with https://" }, { status: 400 });
        patch.platforms[k] = { ...show.platforms[k], url, note: String(v?.note ?? show.platforms[k]?.note ?? "").trim() };
      }
    }
    if (b.move && typeof b.move === "object") patch.move = { ...show.move, ...Object.fromEntries(Object.entries(b.move).map(([k, v]) => [k, v ? String(v) : ""])) };
    const ownerOnly = ["feed_base", "new_feed_url", "locked"].filter((k) => k in b);
    if (ownerOnly.length && me?.role !== "owner") return Response.json({ error: `Only ${OWNER} changes where the feed lives.` }, { status: 403 });
    for (const k of ["feed_base", "new_feed_url"] as const) {
      if (!(k in b)) continue;
      const v = String(b[k] ?? "").trim().replace(/\/$/, "");
      if (v && !/^https:\/\/[^\s]+$/.test(v)) return Response.json({ error: "Use a full https:// address." }, { status: 400 });
      patch[k] = v || null;
    }
    if (typeof b.locked === "boolean") patch.locked = b.locked;
    const { data, error } = await db().from("studio_podcast_shows").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", show.id).select("*").single();
    if (error) throw error;
    return Response.json({ show: data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

// Copy a small file (artwork) from the old host into the public bucket.
async function copyIn(url: string, path: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`The old host answered ${r.status} for ${url}`);
  const type = r.headers.get("content-type") ?? (/\.png$/i.test(url) ? "image/png" : "image/jpeg");
  const { error } = await pstore().upload(path, await r.arrayBuffer(), { contentType: type, cacheControl: "31536000", upsert: true });
  if (error) throw error;
  return path;
}

// A new show is the owner's: it gets its own feed on the same address as the others, the owner details of the first show,
// and its Podcasting 2.0 id from that feed. Everything else is filled in on the page.
async function createShow(req: Request, b: { title?: unknown; slug?: unknown }) {
  if (actor(req)?.role !== "owner") return Response.json({ error: `Only ${OWNER} starts a new show.` }, { status: 403 });
  const title = String(b.title ?? "").trim();
  if (!title) return Response.json({ error: "A show needs a title." }, { status: 400 });
  const slug = slugify(String(b.slug || title));
  if (!slug) return Response.json({ error: "The feed name needs letters or numbers." }, { status: 400 });
  const all = await listShows();
  if (all.some((s) => s.slug === slug)) return Response.json({ error: "Another show already uses that feed name." }, { status: 409 });
  const first = all[0];
  // the first show starts from the brand (brand/studio.json); later ones carry the first show's owner details
  const carry = first ? { author: first.author, owner_name: first.owner_name, owner_email: first.owner_email, website: first.website, language: first.language, copyright: first.copyright, feed_base: first.feed_base, op3: first.op3 } : { author: OWNER_FULL, owner_name: OWNER_FULL, website: WEBSITE };
  const feed = feedUrlFor({ slug, feed_base: first?.feed_base ?? null }, FALLBACK_BASE);
  const { data, error } = await db().from("studio_podcast_shows").insert({ ...carry, slug, title, podcast_guid: podcastGuidFor(feed), locked: true }).select("*").single();
  if (error) throw error;
  return Response.json({ show: data });
}

// "Bring it over": every imported episode whose audio still sits on the old host goes through one cloud machine; the
// artwork comes straight across.
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (b.action === "create-show") return await createShow(req, b);
    if (b.action !== "bring-over") return Response.json({ error: "Unknown action." }, { status: 400 });
    const show = await loadShow(typeof b.show === "string" && b.show ? b.show : pick(req));
    if (!show) return Response.json({ error: "No such show." }, { status: 404 });
    const eps = await loadEpisodes(show.id);
    const sb = db();
    let art = 0;
    if (!show.artwork_path && show.move.artwork_from) {
      const path = await copyIn(show.move.artwork_from, `art/show-${Date.now()}.${/\.png/i.test(show.move.artwork_from) ? "png" : "jpg"}`);
      await sb.from("studio_podcast_shows").update({ artwork_path: path, updated_at: new Date().toISOString() }).eq("id", show.id);
      art++;
    }
    // Episodes that share one cover share one copy.
    const covers = new Map<string, string>();
    for (const e of eps.filter((x) => !x.artwork_path && typeof x.source?.image === "string" && x.source.image !== show.move.artwork_from)) {
      const from = e.source!.image as string;
      if (!covers.has(from)) covers.set(from, await copyIn(from, `art/cover-${covers.size + 1}-${Date.now()}.${/\.png/i.test(from) ? "png" : "jpg"}`));
      await sb.from("studio_podcast_episodes").update({ artwork_path: covers.get(from), updated_at: new Date().toISOString() }).eq("id", e.id);
      art++;
    }
    const waiting = eps.filter((e) => !e.audio_path && e.audio_job?.status !== "running" && typeof e.source?.audio === "string");
    const job = await startAudio(waiting.map((e) => ({ ep: e, src: e.source!.audio as string, name: e.source!.audio as string })), String(show.move.from_feed ?? "old host"));
    return Response.json({ job, audio: waiting.length, art });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
