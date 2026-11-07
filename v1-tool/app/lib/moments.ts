import { run } from "./skill";
import { safeError } from "./supabase";
import { parseTranscript, type Line } from "./transcript";
import { secs } from "./time";
import { AWARENESS, STAGE_BRIEF, STAGE_LABEL, cleanInsight, cleanStage, type Awareness, type Funnel } from "./stages";
import type { Moment, Scores } from "./types";
import { AUDIENCE, BOOKING_OFFER, BRAIN_RULES, BRAIN_TOOLS, COACH, DOC, IDEAL_CLIENT, OWNER, OWNER_FULL, ideasLine } from "./brand";

// The Moment Coach: finds the moments worth making the way a clipping tool does, judged by the owner's standard, so the
// board starts with strong picks instead of scattered ideas. Two passes: the scout reads the whole episode and pulls
// every candidate with scores; the coach re-scores each one against its excerpt, drops the weak ones and writes the plan
// (hook, angle, call to action, design notes) so the team can build it without coming back to ask.
// The content engine: every piece is built for one awareness stage and funnel position, one core
// insight is told as several angles (each its own piece and hook), many more pieces per episode, weighted to the top and
// middle of the funnel; and a standalone idea (a raw transcript with no video) goes through the same two passes.
const HOST = OWNER_FULL;
// Points out of 100: a scroll-stopping hook and the owner as the expert count most, then their own IP and the ideal client.
export const WEIGHTS: Scores = { hook: 2.5, smart: 2.5, ip: 2, icp: 2, standalone: 1 };
export const total = (s: Scores) => Math.round((Object.keys(WEIGHTS) as (keyof Scores)[]).reduce((a, k) => a + Math.max(0, Math.min(10, Number(s[k]) || 0)) * WEIGHTS[k], 0));
// The mix per long-form episode: at least 5 reels, 10 carousels and 10 text posts, the carousels and posts two for each
// of the five awareness levels, so every level gets content and the calendar can carry two to four a day.
// Reels are cut from the footage, so they take the best moments whatever their level (one per level first, where the
// material has it). A standalone idea is a few minutes of the owner talking, so it gets one carousel and one post per level.
// Everything still has to clear the floor; a level the material can't fill is reported, and the kind's other levels
// fill in with their next best.
// An idea built from the training material (lib/ideas.ts BRAIN_SHOW) has no footage and no voice, so no reels (a reel
// missing its core elements doesn't make sense to publish; text and carousels can use any material).
const MIX = {
  episode: { reel: { min: 5, max: 8 }, perLevel: { carousel: 2, post: 2 } },
  idea: { reel: { min: 3, max: 6 }, perLevel: { carousel: 1, post: 1 } },
  brain: { reel: { min: 0, max: 0 }, perLevel: { carousel: 1, post: 1 } },
};
type Source = keyof typeof MIX;
// The bar for a reel. Reels need the clip itself to work, so they're held to it; a short reel count takes the coach's kept
// reels down to BACKUP, marked on the piece. Carousels and posts have no bar: they're built out from the brain, so the
// scores only rank them.
const FLOOR = 55;
const BACKUP = 45;
// How many candidates the scout returns: enough per kind and level that the coach can turn some down and still fill
// the mix. An episode runs 30 to 90 minutes, an idea a few minutes of the owner talking.
const SCOUT_COUNT = { reels: { episode: "8 to 12", idea: "4 to 8", brain: "0" }, text: { episode: "30 to 40", idea: "15 to 20", brain: "15 to 20" } };

const pad = (n: number) => String(n).padStart(2, "0");
const mmss = (t: number) => { const s = Math.max(0, Math.round(t)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`; };
const asLines = (lines: Line[]) => lines.map((l) => `[${mmss(l.t)}] ${l.who || "?"}: ${l.text}`).join("\n");
const json = (r: { last: string; text: string; stop?: string }, who: string) => {
  const m = (r.last.match(/\{[\s\S]*\}/) ?? r.text.match(/\{[\s\S]*\}/))?.[0];
  if (!m) throw new Error(`${who} gave no answer (stopped: ${r.stop || "?"}).`);
  try { return JSON.parse(m); } catch { throw new Error(`${who}'s answer wasn't complete (stopped: ${r.stop || "?"}).`); }
};

const BRAIN = `${BRAIN_TOOLS} The brain is the authority on ${OWNER}'s lane, ideal client, IP, offers and voice, and beats
anything below. Ideas from a podcast guest belong to the guest: credit them by name and never present their advice as
${OWNER}'s own. Never invent quotes, numbers or opinions.`;

// Judged for the format it's planned as: scored as a clip ("the first words heard", "starts clean"), carousels and posts
// never cleared the bar.
const RUBRIC = `Score each moment 0 to 10 on five things, judged for the format it's planned as. Score honestly: a solid moment
worth posting scores 6 or 7 on most counts, 8 is strong, 9 or 10 is rare, and under 5 means it shouldn't be made.
- hook: it can stop a scroll from its first line. A reel: the first words heard do it on their own (a surprising claim, a
  number with an outcome, a named mistake, a strong opinion); throat-clearing, "so yeah", or a line that needs the minute
  before it scores low. A carousel or a post: the material hands the writer a first line that does it, built from what
  was said (a number, a result, a mistake, the listener's words), even when nobody said it first in those words.
- smart: ${HOST} comes across as the expert: teaching, reframing, naming the real problem, or drawing the lesson out of the
  guest's story. A reel of the guest talking alone scores 3 at most, and ${OWNER} only asking a question 2 at most. A
  carousel or a post can tell the guest's story, credited to them, when ${OWNER}'s point or lesson about it is in the episode.
- ip: ${OWNER}'s own thinking, as the brain defines it: ${ideasLine()}. A guest's framework counts only when ${OWNER}
  adds their own angle in the moment.
- icp: it speaks to ${OWNER}'s ideal client (the brain's ideal client profile: ${IDEAL_CLIENT}) in their words, names
  their pain, and leads naturally to one of ${OWNER}'s services or lead magnets. Judge it for the piece's stage: a top-of-funnel
  piece only has to reach the avatar and open the idea; the lead to a service counts more the lower in the funnel it sits.
- standalone: it makes sense with no context. A reel starts clean and ends where the point lands. A carousel or a post
  gives the reader something to keep without the episode: steps to follow, a script to copy, a checklist, numbers to
  use, or a story with its lesson.`;

// The five levels (the brain doc "Content Strategy" can say more for this brand).
const STAGES = `Every piece is built for one awareness level of its reader (Eugene Schwartz's five levels; brain_search
"awareness stages" for ${OWNER}'s own notes in "${DOC.strategy}"), and its funnel position follows from the level:
- unaware (top of funnel): the reader ${STAGE_BRIEF.unaware}
- problem (problem-aware, top of funnel): the reader ${STAGE_BRIEF.problem}
- solution (solution-aware, middle of funnel): the reader ${STAGE_BRIEF.solution}
- product (product-aware, bottom of funnel): the reader ${STAGE_BRIEF.product}
- most (most aware, bottom of funnel): the reader ${STAGE_BRIEF.most}
Much of ${OWNER}'s audience (${AUDIENCE}) starts at the top. A product-aware or most-aware piece needs real proof or a
real offer from the source or the brain (a client result, an objection ${OWNER} answers, ${BOOKING_OFFER}); never invent one.
The highest intention of every piece, on every network, is that people save it to use later: steps
they can follow, a script they can copy, a checklist, numbers they can use. When two moments are close, the one people
would save wins.`;

const SCORES = { type: "object", additionalProperties: false, required: ["hook", "smart", "ip", "icp", "standalone"], properties: { hook: { type: "integer" }, smart: { type: "integer" }, ip: { type: "integer" }, icp: { type: "integer" }, standalone: { type: "integer" } } };
const KIND = { type: "string", enum: ["reel", "carousel", "post"] };
const STAGE = { type: "string", enum: [...AWARENESS] };
const FUNNEL = { type: "string", enum: ["top", "middle", "bottom"] };

const SCOUT_SCHEMA_ALL = {
  type: "object", additionalProperties: false, required: ["candidates"],
  properties: { candidates: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["kind", "title", "start", "end", "speaker", "quote", "scores", "why", "ip_name", "icp_pain", "service", "insight", "awareness", "funnel"],
    properties: { kind: KIND, title: { type: "string" }, start: { type: "string" }, end: { type: "string" }, speaker: { type: "string" }, quote: { type: "string" }, scores: SCORES, why: { type: "string" }, ip_name: { type: "string" }, icp_pain: { type: "string" }, service: { type: "string" }, insight: { type: "string" }, awareness: STAGE, funnel: FUNNEL, brain: { type: "array", items: { type: "string" } } } } } },
};
// one scout per group: the reels, and the carousels and posts together (so their angles share insights)
const scoutSchema = (kinds: string[]) => {
  const x = JSON.parse(JSON.stringify(SCOUT_SCHEMA_ALL));
  x.properties.candidates.items.properties.kind = { type: "string", enum: kinds };
  x.properties.candidates.items.required = [...x.properties.candidates.items.required, "brain"];
  return x;
};

const COACH_SCHEMA = {
  type: "object", additionalProperties: false, required: ["verdicts", "restage"],
  properties: { verdicts: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["id", "keep", "reject", "kind", "title", "start", "end", "scores", "hook", "angle", "needs_take", "cta", "design", "outline", "verdict", "insight", "awareness", "funnel"],
    properties: { id: { type: "integer" }, keep: { type: "boolean" }, reject: { type: "string" }, kind: KIND, title: { type: "string" }, start: { type: "string" }, end: { type: "string" }, scores: SCORES, hook: { type: "string" }, angle: { type: "string" }, needs_take: { type: "boolean" }, cta: { type: "string" }, design: { type: "array", items: { type: "string" } }, outline: { type: "string" }, verdict: { type: "string" }, insight: { type: "string" }, awareness: STAGE, funnel: FUNNEL } } },
    // pieces already on the board from before the levels existed, given theirs
    restage: { type: "array", items: { type: "object", additionalProperties: false, required: ["num", "awareness"], properties: { num: { type: "integer" }, awareness: STAGE } } } },
};
const KINDS = ["reel", "carousel", "post"] as const;
type Kind = (typeof KINDS)[number];
const isKind = (k: unknown): k is Kind => KINDS.includes(k as Kind);

type Candidate = { kind: string; title: string; start: string; end: string; speaker: string; quote: string; scores: Scores; why: string; ip_name: string; icp_pain: string; service: string; insight?: string; awareness?: string; funnel?: string; brain?: string[] };
type Verdict = { id: number; keep: boolean; reject: string; kind: string; title: string; start: string; end: string; scores: Scores; hook: string; angle: string; needs_take: boolean; cta: string; design: string[]; outline: string; verdict: string; insight?: string; awareness?: string; funnel?: string };
// kind: null for a normal episode, "idea" for a standalone idea (a raw transcript, no guest, no camera footage)
type Episode = { title: string; guest: string | null; show: string; kind?: string | null; source?: Source };
export type LeadMagnetRef = { id: string; name: string; keyword: string; offer: string | null };
export type Existing = { num: number; kind: string; title: string; source_time: string | null; source_end: string | null; status: string; awareness?: string | null; insight?: string | null; hook?: string | null; moment?: { quote?: string } | null };
// What one look at an episode did, kept on the episode (studio_episodes.moments) so the team sees it on the board: how
// many ideas the scout found and the coach kept per format, what went on the board, the levels it was short on and why
// the rest were turned down.
export type RunReport = {
  candidates: Record<Kind, number>; kept: Record<Kind, number>; added: Record<Kind, number>; below_bar: number; floor: number;
  gaps: { kind: string; awareness: string; want: number; got: number }[];
  batches: { kind: Kind; candidates: number; ok: boolean; error?: string }[];
  rejected: { title: string; kind: string; awareness: string | null; score: number; reason: string }[];
  seconds: { scout: number; coach: number }; usage: { input: number; output: number };
  scouts?: { group: string; candidates: number; ok: boolean; error?: string }[];
};
// A pick, ready to become a row on the board. animated: a reel made with no camera footage (every reel from an idea).
export type Pick = { kind: string; title: string; hook: string; source_time: string; source_end: string | null; why: string; outline: string | null; editor_notes: string | null; lead_magnet_id: string | null; moment: Moment; awareness: Awareness | null; funnel: Funnel | null; insight: string | null; animated: boolean };

// One insight, several angles: the scout finds the insights first, then tells each strong one for several stages.
const ANGLES = (source: Source) => `Find the core insights first: each is one idea worth teaching (a mechanism, a mistake, a result, a story
with a lesson), named in a short plain phrase of 2 to 6 words, the insight. Then turn each strong insight into several
angles, each its own candidate with its own hook and its own level: the same idea as an unaware story, a problem-aware
wake-up, a solution-aware how-to, a product-aware proof and a most-aware reason to book now, as carousels and posts.
Every angle of one insight carries the exact same insight phrase, and no two angles of one insight share both a level
and a format.
The board needs ${source === "episode" ? "two carousels and two posts" : "one carousel and one post"} for each of the five levels, so give at least
${source === "episode" ? "three" : "two"} carousel and ${source === "episode" ? "three" : "two"} post candidates for every level, product-aware and most aware included.`;

// Carousels and posts are built out from the owner's training material in the brain: text can use any material the
// studio can reach, whatever the video asset.
const BUILD_OUT = (source: Source) => `Carousels and posts don't have to stand on ${source === "brain" ? "the text" : "the moment"} alone: build each one out with ${OWNER}'s training
material in the brain. brain_search each insight's topic once and use what ${OWNER} teaches about it: the frameworks, steps,
scripts, checklists, client results and the stories ${OWNER} tells. ${source === "episode" ? `The episode moment is the spark and the brain gives the substance, so a level the episode is thin on (often\nproduct-aware and most aware) still gets its pieces from what ${OWNER} teaches on the same insight.` : "The text is the spark and the brain gives the substance."}
In brain, name the documents a candidate draws on (their titles as brain_search gives them, three at most; empty when it
needs none). The brain's rules: ${BRAIN_RULES}`;

const scoutSystem = (source: Source, group: "reels" | "text") => {
  const idea = source !== "episode";
  return `You are the Moment Scout in ${OWNER_FULL}'s content studio, the first pass of the Moment Coach: you find the ${group === "reels" ? "reels" : "carousels and text posts"}
worth making, judged by ${OWNER}'s standard. ${BRAIN}
Before you pick, load what you judge against: call get_brand_brief, then brain_get_document "${DOC.strategy}" (content
pillars, strategy, awareness stages) and brain_search for "ideal client"${ideasLine().includes(",") ? ` and ${OWNER}'s named ideas` : ""}. Use recent_content
so you don't repeat a recent angle.
${source === "brain" ? `This is a set of notes gathered from ${OWNER}'s own training material (the brain): no guest and no camera footage. Read all
of it. Line times are estimates from word counts.` : idea ? `This is a standalone idea ${HOST} recorded alone (a voice note, a dictation or notes): no guest and no camera
footage. Read all of it. Line times are estimates from word counts.` : `Read the whole episode. ${HOST} is the host.`}
${RUBRIC}
${STAGES}
${group === "reels" ? `Find the moments that work as reels: the clip itself has to stop a scroll, teach and land on its own, so be strict
here; these scores decide which reels are made. ${idea ? "Reels here are animated, with no camera footage, so one stretch can carry more than one reel." : "Each stretch of the episode carries one reel at most."} Return ${SCOUT_COUNT.reels[source]} reel candidates.
${idea ? `- reel: an animated reel with no camera footage (animated type, graphics and B-roll), its script from one stretch
  of the idea that runs 20 to 75 seconds when said aloud. start = the line time where that stretch begins; end = the line
  time where its point lands (the next line's time is a good end).` : `- reel: one moment, 20 to 75 seconds. start = the line time where the hook sentence begins; end = the line time where the
  point lands and the sentence finishes (the next line's time is a good end). Line times are estimates within a turn.`}
brain: always empty for a reel.` : `${ANGLES(source)}
${BUILD_OUT(source)}
The scores rank the carousels and posts; they don't decide whether one is made. Return ${SCOUT_COUNT.text[source]} candidates.
- carousel: a story, steps or a lesson told simply, one point per slide (most carousels), or a thing to show: an email,
  a before and after, a number.
- post: one idea told well in writing, ${idea ? `in ${OWNER}'s words` : `usually ${OWNER}'s point with the guest's story as proof`}, built out with what ${OWNER} teaches.
start: the line time the piece's spark comes from (00:00 when it comes from the brain alone); end: empty.`}
For each: kind, title (short and plain), start and end (mm:ss), speaker (who carries it: "${HOST}", the guest's name, or
"both"), quote (the first sentence heard, word for word from the transcript; for a piece from the brain alone, its key line
from the brain document), the five scores, why (one plain sentence: what it gives ${OWNER}'s audience), ip_name (the idea of
${OWNER}'s it shows, or empty), icp_pain (the ideal client's pain it speaks to, in their words, or empty), service (the offer or
lead magnet it leads to, or empty), insight (the insight phrase), awareness (unaware, problem, solution, product or most),
funnel (top, middle or bottom, as the level sets it) and brain.
Skip anything that repeats a piece already made or turned down (listed in the message with its stage and insight); a
new angle on one of those insights, for a stage it doesn't have yet, is welcome. Answer with the JSON only.`;
};

// The carousel builder's formats: story is the default, a graphic cover, plain text slides that lead on to the next, and
// the outro; the others only when the idea really is a thing to show.
const CARD_FORMATS = `story (the default), email or DM mockup, guest feature, quote over the frame, side-by-side, stat`;
const EFFECTS = `checklist, screen, orbit, wall, headlines, chart, cover, glass, paper, doodle, frame, punch, zoom-through, vertigo, pullback`;

const coachSystem = (rules: string[], idea: boolean, kind: Kind) => `You are ${COACH}, judging the Moment Scout's candidates before anyone on ${OWNER}'s team sees
them, so the board only shows moments ${OWNER} would make. ${BRAIN}
This batch holds the scout's ${kind} candidates: judge each one as a ${kind === "post" ? "text post" : kind}.
The message may also list pieces already on the board with no awareness level yet (made before the levels existed): for
each, give the level it serves in restage ({num, awareness}), from its title, hook and quote. restage is empty when none
are listed.
Call get_brand_brief first: "${DOC.review}" is your standard, and "${DOC.strategy}" and the ideal client profile set the lane.
${rules.length ? `Rules ${OWNER} added from their own reviews (they beat everything except the ${DOC.guardrails}):\n${rules.map((r) => `- ${r}`).join("\n")}\n` : ""}
${RUBRIC}
${STAGES}
For every candidate (its id is the number in the message): re-score the five scores yourself against its excerpt; don't
trust the scout's numbers. ${kind === "reel" ? `Check the quote is word for word in the excerpt and that start and end land on clean sentence
boundaries, and correct the times when they don't (reels 20 to 75 seconds). Set keep false, with a short reject reason,
when it fails the truth test, needs context to make sense, sits outside ${OWNER}'s lane, or repeats a better candidate or a
piece already made: the scores decide which reels are made.` : `A ${kind === "post" ? "post" : "carousel"} is built out from ${OWNER}'s training material in the
brain (its documents are listed; brain_get_document when you need one), so needing more than the moment gives is never a
reason to drop it, and the scores only rank it. Set keep false, with a short reject reason, only when it fails the truth
test (a claim neither the excerpt nor its brain documents support), sits outside ${OWNER}'s lane, or repeats a better
candidate or a piece already made. Facts from the brain count when its documents say them, with their owner.`}
Another angle of the same insight isn't a repeat when its stage and its hook differ.
For each one you keep, write the plan so the team can build it with no back-and-forth:
- awareness: the level this piece is built for (unaware, problem, solution, product or most). Confirm the scout's or
  correct it from the hook and the angle. funnel follows it: unaware and problem are top, solution is middle, product
  and most are bottom.
- insight: the scout's insight phrase, sharpened only if it's unclear; every angle of one insight keeps the exact same words.
- title: short and plain (you may sharpen the scout's).
- hook: the first line, in ${OWNER}'s voice, written for the reader at that stage, using only facts from the moment: a
  number, an outcome, the listener's words. Voice guardrails, no contrast constructions, no em dashes.
- angle: ${OWNER}'s point in one sentence, what ${OWNER} wants the viewer to believe after. When ${OWNER} makes no point
  of their own in the moment, write the guest's point credited to the guest and set needs_take true.
- cta: one next step. A lead magnet's keyword from the list when one fits the moment, otherwise ${idea ? `empty (an idea has
  no episode to point to)` : `"EPISODE" (the full
  episode)`}.
- design: one to three notes for the editor (reels: ${idea ? `the reel is animated with no camera footage, so say what's on screen
  for the line, from animated type, graphics, B-roll or an effect from ${EFFECTS}` : `an effect from ${EFFECTS}`}) or the designer (carousels: a format from
  ${CARD_FORMATS}), each naming the exact line, in the speakers' words, and its time. Empty for posts.
- outline: carousels only, 8 to 10 lines, one per slide (10 at most: the scheduler takes 10 images a post), "Slide n,
  <format>: what's on it". Story (the default): slide 1 the cover (the hook), then one plain point per slide that leads
  to the next, in the speakers' own words and figures and what ${OWNER} teaches in its brain documents, then the outro
  (booking a call, save, follow). A guest's idea is credited, and a "${OWNER}'s take" slide only from what ${OWNER}
  says. Empty otherwise.
- verdict: one or two plain sentences ${OWNER} would say about why this moment is worth making.
Return every candidate, kept or not. Answer with the JSON only.`;

const overlap = (a: [number, number], b: [number, number]) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0])) / Math.max(1, Math.min(a[1] - a[0], b[1] - b[0]));

// Read the episode (or the idea) and return the board's picks, best first, with the rest and why they were dropped.
export async function findMoments(raw: string, ep: Episode, ctx: { existing: Existing[]; leadMagnets: LeadMagnetRef[]; rules: string[] }) {
  const { lines } = parseTranscript(raw);
  if (!lines.length) throw new Error("The transcript has no lines the app can read.");
  const idea = ep.kind === "idea";
  const lms = ctx.leadMagnets.map((l) => `- ${l.keyword}: ${l.name}${l.offer ? ` (${l.offer})` : ""}`).join("\n") || "- none yet";
  const made = ctx.existing.filter((p) => p.kind !== "episode").map((p) => `- #${p.num} ${p.kind}${p.awareness ? `, ${STAGE_LABEL[p.awareness as Awareness] ?? p.awareness}` : ""}${p.status === "skipped" ? " (turned down)" : ""}: ${p.title}${p.insight ? ` [insight: ${p.insight}]` : ""}${p.source_time ? ` at ${p.source_time}` : ""}`).join("\n") || "- none";
  const source = ep.source === "brain"
    ? `Notes from ${OWNER}'s training material: ${ep.title}\nGathered from the brain for this run: no guest, no camera footage.`
    : idea
    ? `Idea: ${ep.title}\nA standalone idea ${HOST} recorded alone (a voice note, a dictation or notes): no guest, no camera footage.`
    : `Episode: ${ep.title}\nShow: ${ep.show} (${HOST}'s podcast)\nGuest: ${ep.guest ?? "none"}`;
  const head = `${source}\n\nLead magnets (keyword: what it is):\n${lms}\n\nPieces already made or turned down:\n${made}`;

  // Pass 1: two scouts side by side, one for the reels and one for the carousels and posts (a training-material idea has
  // no reels); pass 2: the coach judges each format in its own call as soon as its scout is back, each candidate against
  // its excerpt (half a minute before to a little after; a carousel or a post gets three minutes, since its story can run
  // longer than a clip). Each answer stays short enough to come back whole, and the lot takes the time one call used to.
  const src: Source = ep.source ?? (idea ? "idea" : "episode");
  const mix = MIX[src];
  const t0 = Date.now();
  let t1 = t0;
  const user = `${head}\n\nTranscript (line times are mm:ss):\n${asLines(lines)}`;
  const cands: Candidate[] = [];
  const excerpt = (c: Candidate) => {
    const a = secs(c.start), b = Number.isFinite(secs(c.end)) && secs(c.end) > a ? secs(c.end) : a + (c.kind === "reel" ? 90 : 180);
    return asLines(lines.filter((l) => l.t >= a - 30 && l.t <= b + 15));
  };
  const listed = (i: number) => { const c = cands[i]; return `#${i} ${c.kind}: ${c.title}\nStart ${c.start}${c.end ? `, end ${c.end}` : ""}. Speaker: ${c.speaker}. Scout's scores: ${JSON.stringify(c.scores)}.\nStage: ${c.awareness ?? "?"} (${c.funnel ?? "?"} of funnel). Insight: ${c.insight ?? "?"}\nQuote: ${c.quote}\nWhy: ${c.why}${c.ip_name ? `\nIP: ${c.ip_name}` : ""}${c.icp_pain ? `\nAvatar pain: ${c.icp_pain}` : ""}${c.service ? `\nLeads to: ${c.service}` : ""}${c.brain?.length ? `\nBrain documents: ${c.brain.join("; ")}` : ""}\nExcerpt:\n${excerpt(c)}`; };
  // the pieces made before the levels existed go to the batch of their own format, so the coach gives them theirs
  const unstaged = ctx.existing.filter((p) => p.kind !== "episode" && !p.awareness && p.status !== "skipped");
  const judge = async (kind: Kind, ids: number[], restage: Existing[]) => {
    const tag = restage.length ? `\n\nPieces on the board with no awareness level yet (give each its level in restage):\n${restage.map((p) => `- #${p.num} ${p.kind}: ${p.title}${p.hook ? `\n  Hook: ${p.hook}` : ""}${p.moment?.quote ? `\n  Quote: ${p.moment.quote}` : ""}`).join("\n")}` : "";
    const r = await run(coachSystem(ctx.rules, idea, kind), `${head}${tag}\n\nCandidates:\n\n${ids.map(listed).join("\n\n---\n\n")}`, COACH_SCHEMA);
    return { r, out: json(r, `${COACH} (${kind}s)`) as { verdicts?: Verdict[]; restage?: { num: number; awareness: string }[] } };
  };
  const usage = { input: 0, output: 0 };
  const verdicts: Verdict[] = [], restaged: { num: number; awareness: Awareness }[] = [];
  const scouts: NonNullable<RunReport["scouts"]> = [], batchReport: RunReport["batches"] = [];
  const groups = ([["reels", ["reel"]], ["text", ["carousel", "post"]]] as [string, Kind[]][]).filter(([g]) => g !== "reels" || mix.reel.max > 0);
  await Promise.all(groups.map(async ([g, kinds]) => {
    let mine: number[];
    try {
      const s = await run(scoutSystem(src, g as "reels" | "text"), user, scoutSchema(kinds));
      usage.input += s.usage.input;
      usage.output += s.usage.output;
      const got = ((json(s, `The Moment Scout (${g === "reels" ? "reels" : "carousels and posts"})`).candidates ?? []) as Candidate[])
        .filter((c) => kinds.includes(c.kind as Kind) && c.title && Number.isFinite(secs(c.start)));
      mine = got.map((c) => cands.push(c) - 1);
      scouts.push({ group: g, candidates: got.length, ok: true });
    } catch (e) {
      scouts.push({ group: g, candidates: 0, ok: false, error: safeError(e) });
      return;
    }
    t1 = Math.max(t1, Date.now());
    await Promise.all(kinds.map(async (kd) => {
      const ids = mine.filter((i) => cands[i].kind === kd);
      if (!ids.length) return;
      const restage = unstaged.filter((p) => p.kind === kd);
      let res: Awaited<ReturnType<typeof judge>> | null = null, err: unknown = null;
      // a pass that fails gets one more go while there's time left in the request (800 seconds in all)
      for (let i = 0; i < 2 && !res; i++) {
        if (i && Date.now() - t0 > 7 * 60000) break;
        try { res = await judge(kd, ids, restage); } catch (e) { err = e; }
      }
      if (!res) { batchReport.push({ kind: kd, candidates: ids.length, ok: false, error: safeError(err) }); return; }
      const mineSet = new Set(ids);
      verdicts.push(...(res.out.verdicts ?? []).filter((v) => mineSet.has(v.id)));
      for (const r of res.out.restage ?? []) {
        const a = cleanStage(r.awareness, null).awareness;
        if (a && restage.some((p) => p.num === r.num) && !restaged.some((q) => q.num === r.num)) restaged.push({ num: r.num, awareness: a });
      }
      usage.input += res.r.usage.input;
      usage.output += res.r.usage.output;
      batchReport.push({ kind: kd, candidates: ids.length, ok: true });
    }));
  }));
  if (!cands.length) throw new Error(scouts.some((x) => !x.ok) ? `The Moment Scout failed: ${scouts.map((x) => x.error).filter(Boolean).join("; ")}` : `The Moment Coach found nothing to suggest in this ${idea ? "idea" : "transcript"}.`);
  if (!verdicts.length) throw new Error(`${COACH} couldn't judge the candidates: ${batchReport.map((b) => b.error).filter(Boolean).join("; ")}`);
  const t2 = Date.now();

  // Camera reels already on the board, so a new one doesn't cut the same stretch again. Animated reels have no footage.
  const taken: Record<string, [number, number][]> = {};
  for (const p of ctx.existing) {
    const a = secs(p.source_time);
    if (!idea && p.kind === "reel" && Number.isFinite(a)) (taken.reel ??= []).push([a, Number.isFinite(secs(p.source_end)) ? secs(p.source_end) : a + 45]);
  }
  const scored = verdicts.map((v) => {
    const c = cands[v.id];
    if (!c) return null;
    // the coach may move a carousel to a post or back; a reel stays a reel and a text piece never becomes one
    const kind = isKind(v.kind) && (v.kind === "reel") === (c.kind === "reel") ? v.kind : c.kind;
    const a = Number.isFinite(secs(v.start)) ? secs(v.start) : secs(c.start);
    const e = secs(v.end || c.end);
    const end = kind === "reel" && Number.isFinite(e) && e - a >= 10 && e - a <= 120 ? e : null;
    const score = total(v.scores ?? ({} as Scores));
    const lm = ctx.leadMagnets.find((l) => l.keyword.toUpperCase() === String(v.cta).trim().toUpperCase()) ?? null;
    // the coach's stage over the scout's; bad values become null, and a valid stage sets the funnel.
    const sv = cleanStage(v.awareness, v.funnel), sc = cleanStage(c.awareness, c.funnel);
    const stage = sv.awareness ? sv : sc.awareness ? sc : { awareness: null, funnel: sv.funnel ?? sc.funnel };
    const moment: Moment = {
      score, scores: v.scores, speaker: c.speaker, quote: c.quote, angle: v.angle, verdict: v.verdict, ip_name: c.ip_name, icp_pain: c.icp_pain,
      service: c.service, cta: lm ? lm.keyword : idea ? "" : "EPISODE", needs_take: !!v.needs_take, scout: total(c.scores), at: new Date().toISOString(),
      ...(kind !== "reel" && c.brain?.length ? { brain: c.brain.map((b) => String(b).trim()).filter(Boolean).slice(0, 3) } : {}),
    };
    const pick: Pick = {
      kind, title: (v.title || c.title).trim(), hook: String(v.hook ?? "").trim(), source_time: mmss(a), source_end: end === null ? null : mmss(end), why: String(v.verdict ?? "").trim() || c.why,
      outline: kind === "carousel" && String(v.outline ?? "").trim() ? String(v.outline).trim() : null, editor_notes: kind !== "post" && v.design?.length ? v.design.map((d) => d.trim()).filter(Boolean).join("\n") : null,
      lead_magnet_id: lm?.id ?? null, moment, awareness: stage.awareness, funnel: stage.funnel, insight: cleanInsight(v.insight) ?? cleanInsight(c.insight), animated: idea && kind === "reel",
    };
    const reel = kind === "reel";
    return { pick, keep: !!v.keep && (!reel || score >= BACKUP), reject: v.keep ? (reel && score < BACKUP ? `Scored ${score}, under ${BACKUP}.` : "") : String(v.reject ?? ""), span: [a, end ?? a + 45] as [number, number] };
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((x, y) => y.pick.moment.score - x.pick.moment.score);

  // Fill the mix, best first: the carousels and posts level by level (MIX.perLevel each, counting the ones already on the
  // board), at the bar first and then down to BACKUP, then any level the material couldn't fill goes to the kind's next
  // best from the other levels; the reels one per level first, then the best of the rest up to the max, and down to
  // BACKUP only to reach the min; never two camera reels on the same stretch.
  const live = ctx.existing.filter((p) => p.status !== "skipped").map((p) => ({ ...p, awareness: p.awareness ?? restaged.find((r) => r.num === p.num)?.awareness ?? null }));
  const have = (kind: string, st?: string | null) => live.filter((p) => p.kind === kind && (st === undefined || p.awareness === st)).length;
  const picks: Pick[] = [], rejected: { title: string; kind: string; awareness: string | null; score: number; reason: string }[] = [];
  const gaps: { kind: string; awareness: string; want: number; got: number }[] = [];
  type Scored = (typeof scored)[number];
  const used = new Set<Scored>();
  const overlaps = (x: Scored) => x.pick.kind === "reel" && !x.pick.animated && (taken.reel ?? []).some((t) => overlap(t, x.span) > 0.5);
  const take = (x: Scored) => {
    if (x.pick.kind === "reel" && x.pick.moment.score < FLOOR) x.pick.moment.below_bar = true;
    picks.push(x.pick);
    used.add(x);
    if (x.pick.kind === "reel" && !x.pick.animated) (taken.reel ??= []).push(x.span);
  };
  const open = (kind: string, floor: number, st?: Awareness) => scored.filter((x) => x.keep && x.pick.moment.score >= floor && !used.has(x) && x.pick.kind === kind && (st === undefined || x.pick.awareness === st) && !overlaps(x));
  const count = (kind: string) => have(kind) + picks.filter((p) => p.kind === kind).length;
  for (const kind of ["carousel", "post"] as const) {
    const per = mix.perLevel[kind];
    for (const st of AWARENESS) {
      let want = Math.max(0, per - have(kind, st));
      const got = open(kind, 0, st).slice(0, want);
      got.forEach(take);
      want -= got.length;
      if (want > 0) gaps.push({ kind, awareness: st, want: per, got: per - want });
    }
    // a level the material couldn't fill: the kind's next best from the other levels
    for (const x of open(kind, 0)) { if (count(kind) >= per * AWARENESS.length) break; take(x); }
  }
  for (const st of AWARENESS) {
    if (count("reel") >= mix.reel.max) break;
    const x = open("reel", FLOOR, st)[0];
    if (x) take(x);
  }
  // one at a time: each reel taken claims its stretch, so the next must not overlap it
  for (const [floor, cap] of [[FLOOR, mix.reel.max], [BACKUP, mix.reel.min]] as [number, number][]) {
    for (let x = open("reel", floor)[0]; x && count("reel") < cap; x = open("reel", floor)[0]) take(x);
  }
  const reels = count("reel");
  if (reels < mix.reel.min) gaps.push({ kind: "reel", awareness: "any", want: mix.reel.min, got: reels });
  for (const x of scored) {
    if (used.has(x)) continue;
    const reason = !x.keep ? x.reject : overlaps(x) ? "Overlaps a reel already on the board." : `The ${x.pick.kind === "post" ? "posts" : `${x.pick.kind}s`}${x.pick.awareness && x.pick.kind !== "reel" ? ` for ${STAGE_LABEL[x.pick.awareness].toLowerCase()} readers` : ""} were already full with stronger ones.`;
    rejected.push({ title: x.pick.title, kind: x.pick.kind, awareness: x.pick.awareness, score: x.pick.moment.score, reason: reason || "Didn't make the cut." });
  }
  picks.sort((x, y) => y.moment.score - x.moment.score);
  const byKind = (arr: { kind: string }[]) => Object.fromEntries(KINDS.map((kd) => [kd, arr.filter((x) => x.kind === kd).length])) as Record<Kind, number>;
  const report: RunReport = {
    candidates: byKind(cands), kept: byKind(scored.filter((x) => x.keep).map((x) => x.pick)), added: byKind(picks), below_bar: picks.filter((p) => p.moment.below_bar).length, floor: FLOOR,
    gaps, batches: batchReport, rejected: [...rejected].sort((x, y) => y.score - x.score).slice(0, 80),
    seconds: { scout: Math.round((t1 - t0) / 1000), coach: Math.round((t2 - t1) / 1000) }, usage, scouts,
  };
  return { picks, rejected, gaps, candidates: cands.length, usage, restaged, report };
}
