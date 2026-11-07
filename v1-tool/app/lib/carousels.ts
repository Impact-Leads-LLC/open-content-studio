import { storage } from "./supabase";
import { startCarousel, type CarouselContext } from "./render";
import { secs } from "./time";
import { transcriptFor } from "./coach";
import { parseTranscript } from "./transcript";
import { episodeFeeds, people, stackPair } from "./feeds";
import type { Piece } from "./pieces";
import { OWNER_FULL } from "./brand";

// Start a carousel build on a cloud machine with the carousel builder (carousel-engine), from "Make the carousel" and,
// for a new carousel on the board, on its own (lib/copy.ts): the deck first, then its caption from the slides it got.
export async function startCarouselBuild(p: Piece, ep: { title: string; guest: string | null; show: string }, notes: string) {
  const { data: up } = await storage().list("uploads", { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  const engine = (up ?? []).find((f) => /carousel-engine.*\.tgz$/.test(f.name));
  if (!engine) throw new RangeError("The carousel builder file isn't uploaded.");
  // The transcript from 30 seconds before the idea to 8 minutes after: every word and figure on a slide comes from it,
  // or from the training material the piece names (moment.brain).
  const { lines } = parseTranscript(await transcriptFor(p.episode_id));
  const a = Number.isFinite(secs(p.source_time)) ? secs(p.source_time) : 0;
  const script: NonNullable<CarouselContext["script"]> = [];
  let chars = 0;
  for (const l of lines) {
    if (l.t < a - 30 || l.t > a + 480 || chars > 30000) continue;
    script.push({ at: l.t, who: l.who, text: l.text });
    chars += l.text.length;
  }
  const { top, bottom } = stackPair(people(await episodeFeeds(p.episode_id)));
  return startCarousel(`uploads/${engine.name}`, {
    episode: ep,
    piece: { num: p.num, title: p.title, hook: p.hook, why: p.why, outline: p.outline ?? null, caption: p.caption ?? null, awareness: p.awareness ?? null, insight: p.insight ?? null, brain: p.moment?.brain ?? [] },
    notes: notes || undefined,
    script,
    top: top?.person ?? ep.guest ?? undefined,
    bottom: bottom?.person ?? OWNER_FULL,
  }, { top: top?.video?.path, bottom: bottom?.video?.path });
}
