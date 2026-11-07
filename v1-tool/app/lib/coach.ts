import { pickTranscript } from "./transcript";
import { run, type Block } from "./skill";
import { db, storage, sign, safeError } from "./supabase";
import { CHECKS, KIND } from "./ui";
import { ownCaptions } from "./platforms";
import type { Piece } from "./pieces";
import type { Review } from "./types";
import { brainNote, stageNote } from "./stages";
import { AUDIENCE, COACH, DOC, OWNER, OWNER_FULL, BRAIN_TOOLS } from "./brand";

type Episode = { title: string; guest: string | null; show: string };

export async function transcriptFor(episodeId: string) {
  const { data: files } = await storage().list(`episodes/${episodeId}`, { limit: 200 });
  const tx = pickTranscript((files ?? []).filter((f) => f.id));
  if (!tx) return "";
  return (await (await storage().download(`episodes/${episodeId}/${tx.name}`)).data?.text()) ?? "";
}

const secs = (t: string) => t.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);
const stamp = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// The parts of the transcript a reviewer needs: the minutes around the moment, plus every passage that
// mentions a number the piece uses. A whole episode is too long to send with every review.
export function evidence(transcript: string, sourceTime: string | null, text: string, cap = 20000) {
  // Most episodes fit whole, and the truth test needs every passage (numbers are often spelled out in words).
  if (transcript.length <= 60000) return transcript || "(no transcript uploaded)";
  let t = 0, who = "";
  const items = transcript.split(/\n\s*\n/).map((para) => {
    const m = para.match(/^(.{1,60}?)\s*\(((?:\d+:)?\d{1,2}:\d{2})(?:\.\d+)?\)\s*\n?([\s\S]*)$/);
    if (m) { who = m[1].trim(); t = secs(m[2]); return { t, who, text: m[3].trim() }; }
    return { t, who, text: para.trim() };
  }).filter((i) => i.text);
  const t0 = sourceTime && /^\d/.test(sourceTime) ? secs(sourceTime) : -1;
  const nums = new Set<string>();
  for (const raw of text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const n = raw.replace(/,/g, "");
    if (n.length < 2 && !/[%xk$]/i.test(text)) continue;
    nums.add(n);
    if (/^\d+000$/.test(n)) nums.add(n.replace(/000$/, ""));
  }
  const hit = (s: string) => [...nums].some((n) => new RegExp(`(^|[^\\d])${n}([^\\d]|$)`).test(s.replace(/,/g, "")));
  const keep = items.filter((i) => (t0 >= 0 && i.t >= t0 - 180 && i.t <= t0 + 300) || hit(i.text));
  const out = keep.map((i) => `[${stamp(i.t)}] ${i.who}: ${i.text}`).join("\n\n");
  return out.length > cap ? out.slice(0, cap) + "\n[excerpt cut for length]" : out || "(no transcript uploaded)";
}

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["verdict", "score", "headline", "checks", "fixes", "question", "hooks"],
  properties: {
    verdict: { type: "string", enum: ["ready", "fix", "rethink"] },
    score: { type: "integer" },
    headline: { type: "string" },
    checks: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "pass", "note"], properties: { id: { type: "string", enum: CHECKS.map((c) => c.id) }, pass: { type: "boolean" }, note: { type: "string" } } } },
    fixes: { type: "array", items: { type: "object", additionalProperties: false, required: ["where", "problem", "before", "after"], properties: { where: { type: "string" }, problem: { type: "string" }, before: { type: "string" }, after: { type: "string" } } } },
    question: { type: "string" },
    hooks: { type: "array", items: { type: "string" } },
  },
};

function system(rules: string[]) {
  return `You are ${COACH}, the review layer in ${OWNER_FULL}'s content studio. ${OWNER}'s team makes the content; you
judge each piece the way ${OWNER} would before it reaches ${OWNER}, so ${OWNER} only sees work worth their time. The team
is still learning ${OWNER}'s offers and voice, so be specific and teach as you go. The content is for ${AUDIENCE}.

${BRAIN_TOOLS} Start by calling get_brand_brief. It holds your standard, "${DOC.review}" (the seven checks in priority
order, who the content is for, format standards, verdicts), plus ${OWNER}'s "${DOC.voice}", the "${DOC.guardrails}",
positioning and offers. Use brain_search when you need a specific fact (an offer, a proof point). The brain and
${OWNER}'s rules below are the authority. Never invent facts about ${OWNER}, the offers or ${OWNER}'s opinions.
The seven checks, by id: stop (the first line stops the scroll: a number and an outcome in the reader's words), owner
(the ${OWNER} test: a sentence only ${OWNER} would say), truth, person (names, credits and labels on the right person),
fresh (one point, one proof, nothing repeated), door (one next step that fits this reader), lint (the voice guardrails,
banned phrases, no em dashes).

Judge the piece itself: its text, its slide images, or its reel contact sheet (frames in time order, left to right,
then top to bottom). For the truth test, compare every number, quote and claim with the source excerpt and, when the
piece names brain documents it's built out with, with those; anything in neither fails. For the right-person test on reels, look at who is on screen when each name card or panel appears.
Reels have an effect library worth using: checklist (steps that tick off), screen (the app the
speaker describes: split above them, a phone beside them, or behind them like a green screen), orbit (names circling
the speaker), wall (moments of the episode behind them), headlines (quotes pinned up behind them), chart (a real number
growing), cover (a magazine masthead behind the head), glass (one word standing in the room), paper (a collage with the
speaker as a sticker), doodle (a boiling hand-drawn outline), frame (the speaker breaking out of a social post), punch
(a hard zoom on one word), zoom-through (a zoom-blur at a join), vertigo (the room falls away on a realization) and a
pullback ending into the episode's player. When a strong line sits on plain talking head and one of these would show
it better, make that a fix: where = the line by its words and time, after = the effect by name and what it shows, in
the speakers' words, so the team can paste it into their edits. When an effect only decorates, or repeats another, ask
for the cut or the swap.
${rules.length ? `\nRules ${OWNER} added from their own reviews (they beat everything except the ${DOC.guardrails}):\n${rules.map((r) => `- ${r}`).join("\n")}\n` : ""}
What to return:
- verdict: "ready" when checks 1 to 6 pass and lint is clean; "fix" when the fixes are clear; "rethink" when the stop
  or ${OWNER} test fails or the piece has no reason to exist for this audience.
- score: 0 to 100, how close it is to something ${OWNER} would post today. Ready pieces score 85 or more.
- headline: one or two plain sentences ${OWNER} would say about this piece, calm and direct, no hype, no em dashes.
- checks: all seven ids in order (${CHECKS.map((c) => c.id).join(", ")}), pass true or false, and a note: one plain
  sentence specific to this piece.
- fixes: up to five, most important first. For text, "before" quotes the piece exactly and "after" is the replacement
  in ${OWNER}'s voice, obeying the guardrails. For visuals, "where" says the slide or timestamp and before/after describe
  the change.
- question: when the ${OWNER} test fails, one question only ${OWNER} can answer that would let the team write ${OWNER}'s
  take (for example "What do you believe about this that the guest doesn't?"). Otherwise an empty string.
- hooks: for posts and reels, three alternative first lines that pass the stop test, using only facts from the source.
  Otherwise an empty list.
Never write ${OWNER}'s opinions for them. Answer with the JSON only.`;
}

export async function reviewPiece(p: Piece, ep: Episode) {
  const sb = db();
  const [transcript, rules, notes, fixes] = await Promise.all([
    transcriptFor(p.episode_id),
    sb.from("studio_rules").select("body").eq("status", "active").order("created_at"),
    sb.from("studio_notes").select("author, kind, body, meta").eq("piece_id", p.id).in("kind", ["sendback", "answer"]).order("created_at"),
    sb.from("studio_notes").select("body, meta").eq("piece_id", p.id).eq("kind", "fix").order("created_at", { ascending: false }).limit(10),
  ]);
  // The review before the last rewrite, so the coach holds one standard instead of starting over each time.
  const prev = (fixes.data?.[0]?.meta as { review?: Review } | undefined)?.review;
  // Suggestions the team looked at and chose not to make (any round), so he doesn't keep asking for them.
  const skipped = [...new Set((fixes.data ?? []).flatMap((n) => ((n.meta as { skipped?: { problem: string }[] } | null)?.skipped ?? []).map((f) => f.problem)))];
  const before = [
    prev ? `Your review of the previous ${p.kind === "reel" ? "version" : "draft"}: ${prev.verdict}, ${prev.score}. You asked for:\n${prev.fixes.map((f) => `- ${f.problem}`).join("\n") || "- no fixes"}\nThe team ${p.kind === "reel" ? "changed it" : "rewrote it"} (${fixes.data![0].body}). Judge whether the changes they asked for are made and whether anything new broke. Don't reverse a fix you asked for unless it was factually wrong, and don't raise new small points the previous ${p.kind === "reel" ? "version" : "draft"} also had.` : "",
    skipped.length ? `The team read these suggestions of yours and chose not to make them:\n${skipped.map((s) => `- ${s}`).join("\n")}\nDon't raise them again unless one fails the truth test or the ${OWNER} test; then say why it can't stay.` : "",
  ].filter(Boolean).join("\n");
  const media = p.media ?? {};
  const screen = p.kind === "reel" && media.plan ? await onScreen(media.plan) : "";
  const urls = await sign([...(media.slides ?? []), media.sheet ?? ""]);
  const history = (notes.data ?? []).map((n) => `- ${n.kind === "answer" ? `${OWNER} answered${n.meta?.question ? ` your question "${n.meta.question}"` : ""}` : `${OWNER} sent it back`}: ${n.body}`).join("\n");
  const answered = (notes.data ?? []).some((n) => n.kind === "answer")
    ? `${OWNER} has answered your question. Don't ask it again. The ${OWNER} test now asks whether the piece carries that answer, in ${OWNER}'s words. Ask a new question only if the answer leaves a gap only ${OWNER} can fill.`
    : "";
  const head = [
    `Piece #${p.num}: ${KIND[p.kind] ?? p.kind}`,
    `From: ${ep.title} (${ep.show}). Guest: ${ep.guest ?? "none"}.`,
    `Title: ${p.title}`,
    stageNote(p),
    brainNote(p) ? `${brainNote(p)} Facts from these documents pass the truth test when the documents say them, with their owner (brain_get_document to check).` : "",
    p.hook ? (screen ? `The idea's planned hook (the team's working line, not on screen; the caption may use it): ${p.hook}` : `Planned hook: ${p.hook}`) : "",
    screen,
    p.source_time ? `The moment starts at ${p.source_time} in the episode.` : "",
    p.channels?.length ? `Channels: ${p.channels.join(", ")}` : "",
    history ? `${OWNER}'s earlier feedback on this piece:\n${history}` : "",
    answered,
    before,
    p.kind === "post" ? `The post:\n<<<\n${p.body ?? ""}\n>>>` : "",
    p.kind !== "post" ? captionsFor(p) : "",
  ].filter(Boolean).join("\n");
  const blocks: Block[] = [{ type: "text", text: head }];
  if (p.kind === "carousel") (media.slides ?? []).forEach((s, i) => {
    if (!urls[s]) return;
    blocks.push({ type: "text", text: `Slide ${i + 1}:` }, { type: "image", source: { type: "url", url: urls[s] } });
  });
  if (p.kind === "reel") {
    if (media.sheet && urls[media.sheet]) blocks.push({ type: "text", text: "Reel contact sheet: one frame every 4 seconds, left to right, then top to bottom." }, { type: "image", source: { type: "url", url: urls[media.sheet] } });
    else blocks.push({ type: "text", text: "No frames are available for this reel, so mark the right-person test as failed with the note that it couldn't be checked." });
  }
  const text = [p.title, p.hook ?? "", p.body ?? ""].join("\n");
  blocks.push({ type: "text", text: `Source transcript (the truth test uses only this; if a passage isn't here, say it couldn't be checked instead of guessing who said it):\n${evidence(transcript, p.source_time, text)}` });

  const r = await run(system((rules.data ?? []).map((x) => x.body)), blocks, SCHEMA);
  const json = (r.last.match(/\{[\s\S]*\}/) ?? r.text.match(/\{[\s\S]*\}/) ?? [""])[0];
  if (!json) throw new Error(`${COACH} didn't return a review. Try again.`);
  const raw = JSON.parse(json);
  const byId = new Map<string, { id: string; pass: boolean; note: string }>((raw.checks ?? []).map((c: { id: string; pass: boolean; note: string }) => [c.id, c]));
  const review: Review = {
    verdict: ["ready", "fix", "rethink"].includes(raw.verdict) ? raw.verdict : "fix",
    score: Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0))),
    headline: String(raw.headline ?? ""),
    checks: CHECKS.map((c) => byId.get(c.id) ?? { id: c.id, pass: false, note: "Not checked." }),
    fixes: (raw.fixes ?? []).slice(0, 5),
    question: String(raw.question ?? ""),
    hooks: (raw.hooks ?? []).slice(0, 3),
    at: new Date().toISOString(),
    usage: r.usage,
  };
  return review;
}

// The reel's on-screen words, from the editor's plan, so the review judges what viewers read (the contact sheet is
// too small to read every box). Plan times are seconds in the clip before the cut.
type Plan = { precheck?: { fixes?: { where: string; problem: string }[] }; hook?: { text?: string }; name?: { name?: string; line?: string }; cards?: Graphic[]; graphics?: Graphic[]; end?: { name?: string; line?: string; cta?: string; url?: string }; turns?: { at: number; who: string; side: string }[]; said?: { who: string; at: number; text: string }[]; shots?: { at: number; shot: string; side: string }[];
  effects?: { punches?: number[][]; zooms?: number[]; pullback?: boolean; placed?: [string, string, number, number][] } };
type Graphic = { kind?: string; title?: string; label?: string; text?: string; value?: string; at?: number; rows?: { text?: string }[]; lines?: string[]; bars?: { label?: string; value?: number }[]; app?: string; device?: string };
const q = (s?: string) => `"${s ?? ""}"`;
function describe(g: Graphic) {
  const t = g.title ? ` ${q(g.title)}` : "";
  switch (g.kind) {
    case "stat": return `Number box${t}: ${q(g.value)} counting up, ${q(g.label || g.text)}`;
    case "message": return `Message mockup${t}${g.label ? ` (${g.label})` : ""}: ${q((g.lines ?? [g.text]).join(" "))}${g.value ? `, button ${q(g.value)}` : ""}`;
    case "compare": return `Bar comparison${t}: ${(g.bars ?? []).map((b) => `${q(b.label)} (${b.value})`).join(" vs ")}, the last bar highlighted`;
    case "tag": return `Hanging tag: ${q(g.text || g.title)}`;
    case "clones": return `Clone wall: the camera pulls back and the speaker repeats 3 by 3, label ${q(g.title || g.text)}`;
    case "checklist": return `Checklist box${t} that ticks off with a counter: ${rows(g)}`;
    case "screen": return `${g.app || "email"} on screen (${g.device === "split" ? "the app on top, the speaker underneath" : g.device === "phone" ? "a phone beside the speaker" : "the speaker in front of the app"})${g.label ? `, from ${g.label}` : ""}${t}: ${q((g.lines ?? [g.text]).join(" "))}${g.value ? `, button ${q(g.value)}` : ""}`;
    case "orbit": return `Orbit: chips circle the speaker, passing behind them: ${rows(g)}`;
    case "wall": return `Wall of moments from the episode behind the speaker${t}`;
    case "headlines": return `Headlines pinned up behind the speaker: ${rows(g)}`;
    case "chart": return `Line chart growing behind the speaker${t}: ${(g.bars ?? []).map((b) => `${q(b.label)} (${b.value})`).join(" to ")}`;
    case "cover": return `Magazine cover: masthead ${q(g.title)} behind the speaker's head, cover lines ${(g.lines ?? []).map((x) => q(x)).join(", ")}`;
    case "glass": return `Glass word standing in the room behind the speaker: ${q(g.title)}`;
    case "paper": return `Paper collage, the speaker as a cut-out sticker${t}${g.value ? `, counter ${q(g.value)}` : ""}`;
    case "doodle": return `Doodle: a boiling hand-drawn outline around the speaker${t}`;
    case "frame": return `Social post: the speaker's head breaks out of the photo, caption ${q(g.text)}`;
    default: return `Box${t}: ${rows(g) || "no rows"}`;
  }
}
const rows = (g: Graphic) => (g.rows ?? []).map((r) => q(r.text)).join(", ");
// The caption that goes out with a reel or carousel: one caption on every network, plus any network
// that has its own.
function captionsFor(p: { caption?: string | null; captions?: Record<string, string> | null }) {
  const per = Object.entries(ownCaptions(p.caption, p.captions));
  if (!p.caption?.trim() && !per.length) return "No written caption yet: say so in the door check.";
  return [
    p.caption?.trim() ? `The caption that goes out with it, the same on every network (judge it too; quote it in fixes; where a network's limit is tighter, the app keeps the first and last paragraphs and the middle ones that fit):\n<<<\n${p.caption}\n>>>` : "",
    per.length ? `Networks that have their own caption instead:\n${per.map(([k, v]) => `[${k}]\n<<<\n${v}\n>>>`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

async function onScreen(path: string) {
  try {
    const f = await storage().download(path);
    if (!f.data) return "";
    const pl = JSON.parse(await f.data.text()) as Plan;
    const out = [
      pl.hook?.text ? `Opening bar: "${pl.hook.text}"` : "No opening bar.",
      pl.name?.name ? `Name card: "${pl.name.name}"${pl.name.line ? `, "${pl.name.line}"` : ""}` : "",
      ...(pl.graphics ?? pl.cards ?? []).map(describe),
      pl.effects?.punches?.length ? `Punch-ins (a hard zoom on one word) at ${pl.effects.punches.map((p) => `${Math.round(p[0])} s`).join(", ")}` : "",
      pl.effects?.zooms?.length ? `Zoom-blur transitions at ${pl.effects.zooms.map((z) => `${Math.round(z)} s`).join(", ")}` : "",
      pl.effects?.placed?.some((x) => x[1] === "vertigo") ? "A vertigo move: the room falls away while the speaker holds still" : "",
      pl.effects?.pullback ? "The ending pulls back into the episode's player before the end card" : "",
      pl.end ? `End card: "${pl.end.name ?? ""}", "${pl.end.line ?? ""}", button "${pl.end.cta ?? ""}", "${pl.end.url ?? ""}"` : "",
      pl.shots?.length
        ? "The camera shows one face at a time, cutting to whoever is talking; each box appears large above that speaker in a framed window, plus the end card. In the picture, check: one face at a time, captions readable at phone size, nothing over a face."
        : pl.turns?.length ? `Each box sits in the half of whoever is speaking when it appears (the guest on top, ${OWNER} underneath).` : "",
    ].filter(Boolean);
    // what's said, by speaker, in reel seconds: the source transcript alone can't tell which lines made the cut
    const said = (pl.said ?? []).map((s) => `- ${Math.round(s.at)} s, ${s.who || "speaker"}: ${s.text}`).join("\n");
    // what the coach already asked for when it read the plan, before the render
    const pre = pl.precheck ? (pl.precheck.fixes?.length
      ? `\n\nBefore the render you read this reel's edit plan and asked for:\n${pl.precheck.fixes.map((f) => `- ${f.where}: ${f.problem}`).join("\n")}\nThe editor made those changes. Judge whether they landed; don't ask for them again, and don't raise small points about the plan you passed then.`
      : "\n\nBefore the render you read this reel's edit plan and it passed. Focus on what only the picture shows, and on anything that fails a check outright.") : "";
    return `The words on screen in the reel:\n${out.map((l) => `- ${l}`).join("\n")}${said ? `\n\nWhat's said in the reel, in order (speakers from the transcript's turns):\n${said}` : ""}${pre}`;
  } catch {
    return "";
  }
}

const REVIEWABLE = ["draft", "changes", "ready", "approved", "scheduled"];

// The coach's review when nobody's waiting on it (after a render, after a caption change): a failure goes in the piece's
// thread, since the server's own logs reach nobody.
export async function reviewQuietly(id: string, when: string) {
  try {
    return await reviewAndSave(id);
  } catch (e) {
    await db().from("studio_notes").insert({ piece_id: id, author: COACH, kind: "note", body: `My review ${when} didn't run (${safeError(e)}). Ask for a review before it goes out.` });
    return null;
  }
}

// Review a piece and record it. A pass puts it in the owner's queue; anything else stays with the team. The owner's own
// decisions stand: a fresh review only moves pieces not yet approved.
export async function reviewAndSave(id: string) {
  const sb = db();
  const { data, error } = await sb.from("studio_pieces").select("*, studio_episodes(title, guest, show)").eq("id", id).single();
  if (error) throw error;
  const p = data as Piece & { studio_episodes: Episode };
  if (!REVIEWABLE.includes(p.status)) throw new Error(`Make the piece first, then ask ${COACH}.`);
  const review = await reviewPiece(p, p.studio_episodes);
  const status = ["approved", "scheduled"].includes(p.status) ? p.status : review.verdict === "ready" ? "ready" : "draft";
  const upd = await sb.from("studio_pieces").update({ review, status, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (upd.error) throw upd.error;
  await sb.from("studio_notes").insert({ piece_id: id, author: COACH, kind: "coach", body: review.headline, meta: { verdict: review.verdict, score: review.score } });
  return upd.data as Piece;
}

// The material for a rewrite: the draft, what the coach asked for, what the owner said, and the source.
export async function revisionMaterial(p: Piece & { review?: Review | null }, instruction: string) {
  const sb = db();
  const [transcript, notes] = await Promise.all([
    transcriptFor(p.episode_id),
    sb.from("studio_notes").select("kind, body, meta").eq("piece_id", p.id).in("kind", ["sendback", "answer"]).order("created_at"),
  ]);
  const rv = p.review;
  return [
    `Revise this LinkedIn post draft.\n\nDraft:\n<<<\n${p.body ?? ""}\n>>>`,
    rv?.fixes?.length ? `${COACH}'s fixes (apply each):\n${rv.fixes.map((f) => `- ${f.problem} Before: "${f.before}" After: "${f.after}"`).join("\n")}` : "",
    rv ? `Checks that failed:\n${rv.checks.filter((c) => !c.pass).map((c) => `- ${c.id}: ${c.note}`).join("\n") || "- none"}` : "",
    (notes.data ?? []).length ? `What ${OWNER} said (use these words for ${OWNER}'s take; keep the phrasing, trim only for length):\n${(notes.data ?? []).map((n) => `- ${n.meta?.question ? `Asked "${n.meta.question}", ${OWNER} said: ` : ""}${n.body}`).join("\n")}` : "",
    instruction ? `Instruction from the team: ${instruction}` : "",
    `Source excerpt (every fact must come from here; cut anything that doesn't):\n${evidence(transcript, p.source_time, p.body ?? "", 24000)}`,
  ].filter(Boolean).join("\n\n");
}
