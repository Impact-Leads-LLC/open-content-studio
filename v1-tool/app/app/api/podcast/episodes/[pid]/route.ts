import { db, storage, safeError } from "../../../../../lib/supabase";
import { actor } from "../../../../../lib/auth";
import { slugify, descriptionHtml, type Episode } from "../../../../../lib/podcast";
import { refreshJobs, withUrls, pstore } from "../../../../../lib/podcast-server";
import { OWNER } from "../../../../../lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ pid: string }> };

async function load(pid: string) {
  if (!/^[0-9a-f-]{36}$/.test(pid)) return null;
  const { data } = await db().from("studio_podcast_episodes").select("*").eq("id", pid).maybeSingle();
  return (data as Episode | null) ?? null;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const ep = await load((await params).pid);
    if (!ep) return Response.json({ error: "No such episode." }, { status: 404 });
    const [fresh] = await refreshJobs([ep]);
    return Response.json({ episode: withUrls(fresh) });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

const TEXT = ["title", "summary", "notes", "guest", "guest_url", "youtube_url", "blog_url"] as const;
const LINKS = new Set(["guest_url", "youtube_url", "blog_url"]);
const int = (v: unknown) => (v === null || v === "" ? null : Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < 10000 ? Number(v) : undefined);

// Edits save as the team types. Putting an episode in the feed, or taking it out, is the owner's.
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const me = actor(req);
    const ep = await load((await params).pid);
    if (!ep) return Response.json({ error: "No such episode." }, { status: 404 });
    const b = await req.json();
    const patch: Record<string, unknown> = {};
    for (const k of TEXT) {
      if (typeof b[k] !== "string") continue;
      const v = b[k].trim();
      if (LINKS.has(k) && v && !/^https?:\/\/\S+$/.test(v)) return Response.json({ error: "Links start with https://" }, { status: 400 });
      patch[k] = k === "title" || k === "summary" || k === "notes" ? v : v || null;
    }
    if (patch.title === "") return Response.json({ error: "An episode needs a title." }, { status: 400 });
    if (typeof b.slug === "string") {
      const slug = slugify(b.slug);
      const { data: clash } = await db().from("studio_podcast_episodes").select("id").eq("show_id", ep.show_id).eq("slug", slug).neq("id", ep.id).limit(1);
      if (clash?.length) return Response.json({ error: "Another episode already uses that web address." }, { status: 409 });
      patch.slug = slug;
    }
    for (const k of ["season", "number"] as const) {
      if (!(k in b)) continue;
      const v = int(b[k]);
      if (v === undefined) return Response.json({ error: `The ${k} is a whole number.` }, { status: 400 });
      patch[k] = v;
    }
    if (["full", "trailer", "bonus"].includes(b.episode_type)) patch.episode_type = b.episode_type;
    if (typeof b.explicit === "boolean") patch.explicit = b.explicit;
    if (Array.isArray(b.tags)) patch.tags = b.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 20);
    if ("published_at" in b) {
      if (b.published_at && Number.isNaN(Date.parse(b.published_at))) return Response.json({ error: "That date doesn't read." }, { status: 400 });
      patch.published_at = b.published_at ? new Date(b.published_at).toISOString() : null;
    }
    // Files uploaded on the page land in this episode's folder of the public bucket.
    for (const k of ["artwork_path", "transcript_path"] as const) {
      if (!(k in b)) continue;
      if (b[k] && !String(b[k]).startsWith(`episodes/${ep.id}/`)) return Response.json({ error: "That file belongs to another episode." }, { status: 400 });
      patch[k] = b[k] || null;
    }
    // A transcript from the studio episode's files is copied into the public bucket so apps can read it.
    if (typeof b.transcript_from === "string" && b.transcript_from) {
      if (!ep.episode_id || !b.transcript_from.startsWith(`episodes/${ep.episode_id}/`)) return Response.json({ error: "Pick a transcript from this episode's files." }, { status: 400 });
      const r = await storage().download(b.transcript_from);
      if (!r.data) throw new Error("Couldn't read that transcript.");
      const ext = (b.transcript_from.match(/\.(srt|vtt|txt)$/i)?.[1] ?? "txt").toLowerCase();
      const path = `episodes/${ep.id}/transcript-${Date.now().toString(36)}.${ext}`;
      const type = ext === "vtt" ? "text/vtt" : ext === "srt" ? "application/x-subrip" : "text/plain";
      const { error } = await pstore().upload(path, await r.data.arrayBuffer(), { contentType: `${type}; charset=utf-8`, upsert: false });
      if (error) throw error;
      patch.transcript_path = path;
    }

    const next = { ...ep, ...patch } as Episode;
    if (b.action === "publish") {
      if (me?.role !== "owner") return Response.json({ error: `${OWNER} puts episodes in the feed. Mark it ready and ${OWNER} will see it.` }, { status: 403 });
      if (!next.audio_path || next.audio_job?.status === "running") return Response.json({ error: "The audio isn't ready yet." }, { status: 400 });
      if (!descriptionHtml(next)) return Response.json({ error: "Add a summary or show notes first." }, { status: 400 });
      patch.status = "published";
      patch.published_at = next.published_at ?? new Date().toISOString();
    } else if (b.action === "unpublish") {
      if (me?.role !== "owner") return Response.json({ error: `Only ${OWNER} takes an episode out of the feed.` }, { status: 403 });
      patch.status = "draft";
    } else if (b.action === "ready" || b.action === "draft") {
      if (ep.status === "published") return Response.json({ error: `It's in the feed. ${OWNER} takes it out first.` }, { status: 400 });
      patch.status = b.action;
    }
    if (!Object.keys(patch).length) return Response.json({ episode: withUrls(ep) });
    const { data, error } = await db().from("studio_podcast_episodes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", ep.id).select("*").single();
    if (error) throw error;
    return Response.json({ episode: withUrls(data as Episode) });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

// A draft that never went out can be thrown away; its files go with it.
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const ep = await load((await params).pid);
    if (!ep) return Response.json({ error: "No such episode." }, { status: 404 });
    if (ep.status === "published") return Response.json({ error: `It's in the feed. ${OWNER} takes it out first.` }, { status: 400 });
    const { data: files } = await pstore().list(`episodes/${ep.id}`, { limit: 100 });
    if (files?.length) await pstore().remove(files.map((f) => `episodes/${ep.id}/${f.name}`));
    const { error } = await db().from("studio_podcast_episodes").delete().eq("id", ep.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
