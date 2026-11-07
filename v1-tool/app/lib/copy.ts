import { COACH } from "./brand";
import { after } from "next/server";
import { db, safeError } from "./supabase";
import { cookieToken, COOKIE } from "./auth";
import { draftCaptions } from "./captions";
import { writePostFor } from "./posts";
import type { Piece } from "./pieces";
import { startCarouselBuild } from "./carousels";

// Every piece comes with its words, so the owner only edits and reviews: as soon as an idea is on the board, a post is
// written with the LinkedIn skill and a reel or carousel gets its caption, each with the coach's first look. Once the
// owner has approved a piece, nothing adds to it.
// The full episode gets its description too (2026-11-07: it went out with no words on YouTube, LinkedIn and Facebook).
const KINDS = ["reel", "carousel", "post", "episode"];
const OPEN = ["concept", "kept", "draft", "changes", "ready"];
// A claim older than this was lost (its request ran out of time), so the next look at the episode starts it again.
const STALE = 30 * 60000;

type Row = Pick<Piece, "id" | "kind" | "status" | "body" | "caption" | "captions"> & { copy_since?: string | null; copy_failed?: number | null };

export const hasCopy = (p: Row) => (p.kind === "post" ? !!p.body?.trim() : !!p.caption?.trim() || Object.keys(p.captions ?? {}).length > 0);
// Two failed tries and it waits for the team's "Write it for me".
export const needsCopy = (p: Row, now = Date.now()) =>
  KINDS.includes(p.kind) && OPEN.includes(p.status) && !hasCopy(p) && (p.copy_failed ?? 0) < 2 && (!p.copy_since || now - Date.parse(p.copy_since) > STALE);

// One piece's words. The /copy route runs it, one request per piece, so each has its own time limit.
export async function draftCopy(id: string) {
  const sb = db();
  const { data, error } = await sb.from("studio_pieces").select("*, studio_episodes(title, guest, show)").eq("id", id).single();
  if (error) throw error;
  const p = data as Piece & Row & { studio_episodes: { title: string; guest: string | null; show: string } };
  if (hasCopy(p) || !KINDS.includes(p.kind) || !OPEN.includes(p.status)) {
    await sb.from("studio_pieces").update({ copy_since: null }).eq("id", id);
    return { written: false };
  }
  // A new carousel builds its deck first, on its own; the caption is written
  // from the slides once the deck lands (lib/pieces.ts finished), so it matches what's on them. One that was built
  // before, or whose build failed, gets its caption here.
  if (p.kind === "carousel" && !p.media?.slides?.length && !p.media?.render) {
    try {
      const buildId = await startCarouselBuild(p, p.studio_episodes, p.editor_notes ?? "");
      await sb.from("studio_pieces").update({ status: "making", media: { ...p.media, render: buildId, render_error: undefined, render_status: "" }, copy_since: null, updated_at: new Date().toISOString() }).eq("id", id);
      await sb.from("studio_notes").insert({ piece_id: id, author: "Studio", kind: "note", body: `Building the carousel on its own. Its caption is written from the slides when the deck lands, then ${COACH} reviews it.` });
      return { written: false, building: true };
    } catch (e) {
      // no build: the caption from the slide plan, as before
      await sb.from("studio_notes").insert({ piece_id: id, author: "Studio", kind: "note", body: `The carousel couldn't start building on its own (${safeError(e)}). Use Make the carousel.` });
    }
  }
  try {
    if (p.kind === "post") {
      const r = await writePostFor(p, p.studio_episodes);
      // the media as it is now: writing the post made its graphic (media.image, media.card), and the copy read before that
      // would wipe it (until 2026-11-07 every auto-written post lost its graphic this way)
      const { data: cur } = await sb.from("studio_pieces").select("media").eq("id", id).single();
      await sb.from("studio_pieces").update({ body: r.body, media: { ...((cur?.media as object) ?? p.media), usage: r.usage }, copy_since: null, copy_failed: 0, updated_at: new Date().toISOString() }).eq("id", id);
      // kept while it was being written: it's a draft now (an idea stays an idea until someone keeps it)
      await sb.from("studio_pieces").update({ status: "draft" }).eq("id", id).eq("status", "kept");
    } else {
      await draftCaptions(id, "Writer");
      await sb.from("studio_pieces").update({ copy_since: null, copy_failed: 0 }).eq("id", id);
    }
    return { written: true };
  } catch (e) {
    const tries = (p.copy_failed ?? 0) + 1;
    await sb.from("studio_pieces").update({ copy_since: null, copy_failed: tries }).eq("id", id);
    await sb.from("studio_notes").insert({ piece_id: id, author: "Writer", kind: "note", body: `Couldn't write the ${p.kind === "post" ? "post" : "caption"} on my own: ${safeError(e)}${tries >= 2 ? ` Use ${p.kind === "post" ? "Write the post" : "Write it for me"}.` : " I'll try again the next time the episode is opened."}` });
    throw e;
  }
}

// Claims the pieces that still need their words, so two tabs never write one twice. Only unclaimed pieces (or lost
// claims) come back.
export async function claimCopy(ids: string[]) {
  const at = new Date().toISOString();
  if (!ids.length) return { ids: [] as string[], at };
  const cutoff = new Date(Date.now() - STALE).toISOString();
  const { data, error } = await db().from("studio_pieces").update({ copy_since: at }).in("id", ids).or(`copy_since.is.null,copy_since.lt."${cutoff}"`).select("id");
  if (error) throw error;
  return { ids: (data ?? []).map((r) => r.id as string), at };
}

// The request that runs the writer has 800 seconds (the routes' maxDuration), and a look at an episode can use most of
// them before its 25 or so pieces need words, so it stops starting new ones after DEADLINE and lets go of the rest: the
// board picks them up the next time it loads (the episode route's queueCopy), instead of holding them for half an hour.
const DEADLINE = 11 * 60000;
// Writes claimed pieces four at a time, each in its own request to /api/pieces/[id]/copy signed in as the person who
// caused it (the app's own front door, so nothing new is opened). Read from the request while it's live.
function writer(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const token = cookieToken(req);
  const until = Date.now() + DEADLINE;
  const headers = { cookie: `${COOKIE}=${token}`, "content-type": "application/json" };
  return async (ids: string[]) => {
    const queue = [...ids];
    if (host && token) {
      const one = async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
          if (Date.now() > until) { queue.unshift(id); return; }
          await fetch(`${proto}://${host}/api/pieces/${id}/copy`, { method: "POST", headers }).catch(() => null);
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, one));
      // out of time with pieces left: a fresh request (its own 800 seconds) carries on with them, still claimed
      if (queue.length && (await fetch(`${proto}://${host}/api/pieces/write`, { method: "POST", headers, body: JSON.stringify({ ids: queue }) }).then((r) => r.ok).catch(() => false))) return;
    }
    // no way to carry on: let go of them, so the board starts them the next time it loads
    if (queue.length) await db().from("studio_pieces").update({ copy_since: null }).in("id", queue);
  };
}

// After a long run (finding the moments): claim the new pieces and hand them straight to a fresh request, so their words
// get the whole of its time instead of what's left of this one.
export function copyRelay(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const token = cookieToken(req);
  const write = writer(req);
  return async (ids: string[]) => {
    const c = await claimCopy(ids);
    if (!c.ids.length) return;
    const ok = host && token && (await fetch(`${proto}://${host}/api/pieces/write`, { method: "POST", headers: { cookie: `${COOKIE}=${token}`, "content-type": "application/json" }, body: JSON.stringify({ ids: c.ids }) }).then((r) => r.ok).catch(() => false));
    if (!ok) await write(c.ids);
  };
}

// The /api/pieces/write route: writes pieces already claimed, after its response.
export function writeClaimed(req: Request, ids: string[]) {
  const write = writer(req);
  after(() => write(ids).catch((e) => console.error("writing the copy failed:", String(e).slice(0, 200))));
}

// In a route: claim now, so the page that asked already shows them being written, and write after the response.
export async function queueCopy(req: Request, ids: string[]) {
  const c = await claimCopy(ids);
  if (c.ids.length) {
    const write = writer(req);
    after(() => write(c.ids).catch((e) => console.error("writing the copy failed:", String(e).slice(0, 200))));
  }
  return c;
}
