import { COACH, OWNER, PRIMARY, bookingUrl } from "./brand";
import { db, sign, storage } from "./supabase";
import { polishCaption, writeCaptions } from "./skill";
import { transcriptFor } from "./coach";
import { parseTranscript } from "./transcript";
import { secs, clock } from "./time";
import { LABEL, ctaPlan, ensureSave, platformsFor, withEnding, type LeadMagnet } from "./platforms";
import { safeError } from "./supabase";
import { episodeExtras } from "./links";
import { brainNote, isAnimated, stageNote } from "./stages";
import type { Piece } from "./pieces";

// The caption for a reel or carousel, one for every network, from what's said in the moment (and a
// carousel's slides, or its slide plan before it's built). Used by "Write it for me" and, as soon as the idea is on the
// board, on its own (lib/copy.ts).
export async function draftCaptions(id: string, author: string) {
  const sb = db();
  const { data, error } = await sb.from("studio_pieces").select("*, studio_episodes(title, guest, show, kind)").eq("id", id).single();
  if (error) throw error;
  const p = data as Piece & { studio_episodes: { title: string; guest: string | null; show: string; kind?: string | null } };
  const lm = p.lead_magnet_id ? ((await sb.from("studio_lead_magnets").select("*").eq("id", p.lead_magnet_id).maybeSingle()).data as LeadMagnet | null) : null;
  const platforms = platformsFor(p.kind, p.channels);
  const { lines } = parseTranscript(await transcriptFor(p.episode_id));
  const a = p.media?.cut?.start ?? (Number.isFinite(secs(p.source_time)) ? secs(p.source_time) : 0);
  const b = p.media?.cut?.end ?? (Number.isFinite(secs(p.source_end)) ? secs(p.source_end) : a + (p.kind === "carousel" ? 300 : 60));
  const said = lines.filter((l) => l.t >= a - 20 && l.t <= b + 10).map((l) => `[${clock(l.t)}] ${l.who}: ${l.text}`).join("\n").slice(0, 20000);
  // a built carousel's slide copy, so the captions match what's on the slides
  let slides = "";
  if (p.kind === "carousel" && p.media?.plan?.endsWith("deck.json")) {
    const f = await storage().download(p.media.plan).catch(() => null);
    const deck = f?.data ? JSON.parse(await f.data.text()) as { copy?: { name: string; copy: string[] }[] } : null;
    slides = (deck?.copy ?? []).map((s) => `${s.name}: ${s.copy.join(" / ")}`).join("\n");
  }
  // slides put together from uploaded images have no copy on file, so the writer reads the images
  const images = p.kind === "carousel" && !slides && p.media?.slides?.length
    ? await sign(p.media.slides.slice(0, 10)).then((u) => p.media!.slides!.slice(0, 10).map((s) => u[s]).filter(Boolean))
    : [];
  const m = p.moment;
  const ep = p.studio_episodes;
  const material = [
    `Episode: ${ep.title} (${ep.show}). Guest: ${ep.guest ?? "none"}.`,
    `Piece #${p.num}, a ${p.kind}: ${p.title}`,
    p.hook ? `Planned hook: ${p.hook}` : "",
    `Networks: ${platforms.map((x) => LABEL[x]).join(", ")}`,
    lm ? `It points to a lead magnet: ${lm.name} (keyword ${lm.keyword}). What they get: ${lm.offer ?? ""}${lm.link ? ` Link: ${lm.link}` : ""}` : "No lead magnet on this one.",
    p.why ? `Why it's worth making: ${p.why}` : "",
    stageNote(p),
    brainNote(p),
    isAnimated(p) ? "It's an animated reel with no camera footage (animated type, graphics and B-roll)." : "",
    m ? `What the Moment Coach saw: ${m.angle} The line: "${m.quote}" (${m.speaker}).${m.ip_name ? ` ${OWNER}'s idea in it: ${m.ip_name}.` : ""}${m.icp_pain ? ` The buyer's pain it speaks to: ${m.icp_pain}.` : ""}` : "",
    slides ? `The slides, in order:\n${slides}` : "",
    images.length ? `The ${images.length} slides are attached as images, in order. The caption goes out with them, so it matches what's on them.` : "",
    p.kind === "carousel" && !slides && !images.length && p.outline ? `It isn't built yet. The slide plan (its talking points):\n${p.outline}` : "",
    p.kind === "reel" ? `The clip runs ${clock(a)} to ${clock(b)}. What's said, with a few lines either side:\n${said || "(no transcript)"}` : "",
    p.kind === "carousel" && said ? `What's said around the moment:\n${said}` : "",
    p.kind === "episode" ? await episodeMaterial(p, lines) : "",
  ].filter(Boolean).join("\n\n");
  // The main network (brand/studio.json) gets the caption's own next step when it goes there; the others get their own
  // last paragraph where theirs works differently.
  const base = platforms.includes(PRIMARY) ? PRIMARY : platforms[0];
  // the episode's own link (the one on the episode page, else the published episode's video or blog post)
  const { link } = await episodeExtras(p.episode_id);
  const r = await writeCaptions(material, platforms, base, ctaPlan(lm, platforms, link, p.studio_episodes?.kind === "idea", { assess: p.awareness === "product" || p.awareness === "most", booking: bookingUrl() }), images);
  if (!r.caption) throw new Error("The writer didn't return a caption. Try again.");
  // a placeholder like [EPISODE URL] would go out as written: that network's ending goes back to the shared one
  const PLACEHOLDER = /\[[^\]]*(url|link)[^\]]*\]/i;
  if (PLACEHOLDER.test(r.caption)) throw new Error("The writer left a placeholder link in the caption. Try again.");
  r.endings = r.endings.filter((e) => !PLACEHOLDER.test(e.last));
  // the coach's first look before the team sees it; if it fails, the draft stands as written
  const { data: rules } = await sb.from("studio_rules").select("body").eq("status", "active").order("created_at");
  let lookError = "";
  const look = await polishCaption(r.caption, material, (rules ?? []).map((x) => x.body)).catch((e) => { lookError = safeError(e); return null; });
  // the save line before the next step, whether or not the writer kept it (lib/platforms.ts)
  const caption = ensureSave(look?.caption || r.caption);
  // a new draft replaces any network's own caption: the shared one with that network's next step, where it differs
  const own = Object.fromEntries(r.endings.filter((e) => e.network !== base && platforms.includes(e.network) && e.last.trim())
    .map((e) => [e.network, withEnding(caption, e.last)]).filter(([, v]) => v !== caption));
  const upd = await sb.from("studio_pieces").update({ caption, captions: own, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (upd.error) throw upd.error;
  await sb.from("studio_notes").insert({ piece_id: id, author: author.slice(0, 40), kind: "note", body: `Drafted the caption for ${platforms.map((x) => LABEL[x]).join(", ")}${lm ? ` (lead magnet ${lm.keyword})` : ""}, written for ${LABEL[base]} first.${Object.keys(own).length ? ` ${Object.keys(own).map((x) => LABEL[x as keyof typeof LABEL]).join(", ")} ${Object.keys(own).length > 1 ? "get their" : "gets its"} own last line for the next step there.` : ""}` });
  if (r.note) await sb.from("studio_notes").insert({ piece_id: id, author: "Writer", kind: "note", body: r.note });
  // the coach's first look always leaves a note, so a pass and a failure never look the same
  const lookNote = look ? (look.changes.length ? `First look at the caption, before the team saw it: ${look.changes.join(" ")}` : "First look at the caption, before the team saw it: it passes as written.")
    : `My first look at the caption didn't run (${lookError || "no answer"}), so it's as the writer wrote it. Ask for a review before it goes out.`;
  await sb.from("studio_notes").insert({ piece_id: id, author: COACH, kind: "note", body: lookNote });
  return upd.data as Piece;
}

// The full episode's words (YouTube, LinkedIn, Facebook): what it covers, from its chapters once the produced edit made
// them and the conversation itself.
async function episodeMaterial(p: Piece, lines: { t: number; who: string; text: string }[]) {
  const ch = (p.media as { chapters?: string } | null)?.chapters;
  const chapters = ch ? await storage().download(ch).then(async (f) => (f.data ? (await f.data.text()).slice(0, 4000) : "")).catch(() => "") : "";
  const talk = lines.map((l) => `[${clock(l.t)}] ${l.who}: ${l.text}`).join("\n").slice(0, 30000);
  // the chapters themselves go under it on YouTube when it's sent (the send route), so the caption doesn't repeat them
  return ["This is the full episode, so the caption is its description: what the listener gets from it, who the guest is and why to watch, then the next step. Don't list the chapters; they're added under it on YouTube.",
    chapters ? `Its chapters (what it covers):\n${chapters}` : "",
    talk ? `The conversation:\n${talk}` : ""].filter(Boolean).join("\n\n");
}
