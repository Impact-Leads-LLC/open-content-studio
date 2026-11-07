import { db, storage } from "./supabase";
import { renderCard, fallbackLine, type CardLook } from "./postcard";
import type { Piece, PostCard } from "./pieces";

// Make (or remake) a text post's branded graphic and put it on the post as its image, so the post can
// go out as an image post too (Instagram comes on with an image). The words: what the caller gives, else the card line
// the writer gave, else the post's first sentence. The look takes turns by the post's number unless one is asked for.
export async function makeCard(p: Pick<Piece, "id" | "episode_id" | "num" | "hook" | "body" | "media">, opts: { line?: string; look?: string } = {}) {
  const line = (opts.line ?? p.media?.card?.line ?? "").trim() || fallbackLine(p.hook || p.body || "");
  if (!line) throw new Error("The post has no words for a graphic yet.");
  const look: CardLook = opts.look === "harbor" || opts.look === "light" ? opts.look : p.num % 2 ? "harbor" : "light";
  const { data: ep } = await db().from("studio_episodes").select("show, kind").eq("id", p.episode_id).single();
  const png = await renderCard({ line, look, label: ep?.kind === "idea" ? null : ep?.show ?? null });
  const path = `episodes/${p.episode_id}/post-cards/${p.num}-${Date.now()}.png`;
  const up = await storage().upload(path, png, { contentType: "image/png", upsert: true });
  if (up.error) throw up.error;
  const card: PostCard = { line, look, at: new Date().toISOString() };
  // re-read the media just before writing it, so nothing saved meanwhile is lost
  const { data: cur } = await db().from("studio_pieces").select("media").eq("id", p.id).single();
  const media = { ...((cur?.media as object) ?? {}), image: path, card };
  const upd = await db().from("studio_pieces").update({ media, updated_at: new Date().toISOString() }).eq("id", p.id);
  if (upd.error) throw upd.error;
  return { image: path, card };
}
