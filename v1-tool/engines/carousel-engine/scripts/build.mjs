// The carousel builder. Claude plans the deck and picks moments for stills, ffmpeg pulls those stills from the camera
// feeds at full resolution, the slides are written and rendered with Chrome, and what came out is checked. The carousel
// skill in kit/ is the authority on design and copy, under the studio's own brain doc "Carousels". Progress lines go to
// <job>/status.txt for the app.
//
// Two formats (carousel skill 5.0: simple decks, a graphic on the front card and plain text after it):
// - story (the default, for a story, steps, a lesson or a list): Claude plans the copy only and a fixed template writes
//   every slide, so every story deck looks the same and simple: a cover on the primary colour with the hook (its key
//   words the one accent moment) and an episode still in a framed window, light reading slides with one bold line each
//   and the save pill on the 3rd or 4th, and the outro.
// - artifact (only when the idea is a thing to show: an email or DM, a page, a side-by-side, a stat): Claude writes the
//   slides in the kit's HTML as before, then the outro is added.
// Every deck ends with the same outro (the brand's call to action, save the post, follow), and has at most 10 slides:
// schedulers that post through Instagram's API take at most 10 images per post.
// Names, the handle and the palette come from context.json studio; nothing about the brand is written in here.
//
// Env: ANTHROPIC_API_KEY, BRAIN_MCP_URL + BRAIN_MCP_TOKEN (the studio's brain), CLAUDE_MODEL (optional), TOP_URL /
// BOTTOM_URL (the camera feeds: the guest's and the host's), FAL_KEY / FAL_IMAGE_MODEL (optional: a generated cover
// picture), JOB_DIR (default /tmp/job, holds context.json and status.txt), DECK_DIR / WORK_DIR (default deck/ and work/
// next to this folder), PLAN_FILE (a story plan JSON: skip the Claude calls and render it, for tests).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { brain, brainRules, DOCS, MODEL, studioOf } from "./studio.mjs";

const E = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JOB = process.env.JOB_DIR || "/tmp/job";
const KIT = path.join(E, "kit"), DECK = process.env.DECK_DIR || path.join(E, "deck"), WORK = process.env.WORK_DIR || path.join(E, "work");
const SLIDES = path.join(DECK, "slides"), ASSETS = path.join(DECK, "assets"), PNG = path.join(DECK, "png");
for (const d of [SLIDES, ASSETS, PNG, WORK]) fs.mkdirSync(d, { recursive: true });
// the kit's stylesheet as the slides link it (relative, so DECK_DIR can live anywhere)
const KITCSS = path.relative(SLIDES, path.join(KIT, "template/kit.css")).split(path.sep).join("/");
const ctx = JSON.parse(fs.readFileSync(path.join(JOB, "context.json"), "utf8"));
const STATUS = path.join(JOB, "status.txt");
const MAX = 10;
const TEST = process.env.PLAN_FILE ? JSON.parse(fs.readFileSync(process.env.PLAN_FILE, "utf8")) : null;
let t = Date.now();
const say = (m) => { const n = Date.now(); fs.appendFileSync(STATUS, `${m}: ${Math.round((n - t) / 1000)} s\n`); t = n; };
const note = (m) => fs.appendFileSync(STATUS, `${m}\n`);
const BRAIN = brain();
if (!TEST && (!process.env.ANTHROPIC_API_KEY || !BRAIN)) throw new Error("The carousel needs the Claude key and the brain connection (BRAIN_MCP_URL, BRAIN_MCP_TOKEN).");
const st = studioOf(ctx);
const O = st.owner, C = st.coach, SHOW = ctx.episode?.show || st.show || "the show";
const used = { input: 0, output: 0 };

// ---- the skill, as the model reads it ---------------------------------------------------------------------------
const read = (p) => fs.readFileSync(path.join(KIT, p), "utf8");
const htmls = (dir) => fs.existsSync(path.join(KIT, dir)) ? fs.readdirSync(path.join(KIT, dir)).filter((f) => f.endsWith(".html")).sort().map((f) => `<example file="${dir}/${f}">\n${read(path.join(dir, f))}\n</example>`).join("\n") : "";
const SKILL = ["SKILL.md", "references/formats.md", "references/broll.md", "references/editorial-list.md", "template/kit.css", "template/blank.html"]
  .filter((f) => fs.existsSync(path.join(KIT, f))).map((f) => `<file name="${f}">\n${read(f)}\n</file>`).join("\n\n");
const EXAMPLES = htmls("examples/kit-gallery/slides");

// Who the reader is at each awareness stage (the brand brief names the offer and the problems it solves).
const STAGE = {
  unaware: `the unaware reader: doesn't know the idea is an answer at all (for ${O}'s main offer in the brand brief: doesn't know this approach can solve their problem). Open the idea with a story, a surprising result, or the idea itself.`,
  problem: "the problem-aware reader: feels the problem the brand brief names but doesn't see this as the answer. Name the problem in their words, show what it costs, hint at the way out.",
  solution: "the solution-aware reader: knows the approach exists or doesn't know how to do it well. Show how it works: the mechanism, the mistakes, the steps, the numbers.",
  product: `the product-aware reader: knows ${O} and what they offer, and needs proof and trust. Client results and objections answered, from the source only.`,
  most: `the most-aware reader: knows ${O} and the offer and needs the reason to act now. Make the next step plain and easy: what the call to action in the brand brief gets them.`,
};

const SYSTEM = `You build carousels inside ${st.brand}'s content studio app. The host is ${st.ownerFull}${st.show ? `, host of ${st.show}` : ""};
their social handle is ${st.handle || "(none: leave it off the slides)"}${st.audience ? `, and they make content for ${st.audience}` : ""}.
The carousel skill (v5) is below, with its HTML kit and a gallery of its parts. The skill is the authority, under the
studio's own brain doc "${DOCS.carousels}" (where they differ, the brain doc wins): its brand layer, format library, guest
rules, B-roll rules, copy rules and delivery gate all apply. Two differences in the app: there is no frames round (the
team reviews the finished deck, ${C} checks it first, and they ask for another direction with notes), and you can't
browse the web, so B-roll is the episode stills you're given plus ${O}'s own photos from the brain (photo_pick).
The story format is the default: a graphic cover, then plain reading slides, then the outro. Use the artifact path
only when the idea really is a thing to show (an email, a DM, a page, a side-by-side, a stat). In story mode you write
the copy only and the app's template draws every slide. In both modes the app adds the outro (the call to action, save
the post, follow), so never write a call-to-action slide yourself.
Use the brain: call get_brand_brief first, then read "${DOCS.carousels}", "${DOCS.voice}", "${DOCS.guardrails}" and
"${DOCS.avoidAi}" (brain_search, brain_get_document), and any doc on awareness stages for the stage the piece is built
for. Use a glyph only when the brain has a glyph library doc, and photo_pick for photos of ${O} (their own photos, never
anyone else, never generated). ${brainRules(st)} Keep a guest's words and figures exactly as the transcript has them.
Never invent an email, a figure, a name or a result. Voice: full sentences at a fifth-grade reading level, no em dashes
or en dashes, no "X, not Y" contrast lines, no "Stop doing X" openers, none of the banned phrases in the
${DOCS.guardrails}; name the call to action the way the brand brief names it. Design rules: no clip-art icons; list
bullets are small dots and a glyph appears only from the library. A plain check and cross are fine on one slide that
sorts good from bad, never on every list and never in a circle or badge. When the team's notes ask for something, do
it unless it breaks a brand rule, and say so in your notes if you skip one.

${SKILL}

The kit gallery (placeholder copy; the parts, not a deck to copy):
${EXAMPLES}`;

async function ask(content, schema, label) {
  const params = {
    model: MODEL,
    max_tokens: 64000,
    output_config: schema ? { effort: "medium", format: { type: "json_schema", schema } } : { effort: "medium" },
    betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...BRAIN,
    system: SYSTEM,
    messages: [{ role: "user", content }],
  };
  // loaded here, so a PLAN_FILE test renders without the SDK installed
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  // The brain lookups run on Anthropic's side, and a long run of them pauses the turn (pause_turn): sending it back
  // carries on. A cut-off answer says so instead of coming back as no answer at all (2026-11-07).
  const send = async (p) => {
    const messages = [...p.messages];
    let m, out = 0;
    for (let i = 0; i < 5; i++) {
      m = await new Anthropic().beta.messages.stream({ ...p, messages }).finalMessage();
      out += m.usage?.output_tokens ?? 0;
      if (m.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: m.content });
    }
    if (m.stop_reason === "max_tokens") throw new Error(`The answer was cut off at the length limit (${out} tokens out).`);
    if (m.stop_reason === "pause_turn") throw new Error("The brain lookups didn't finish after five rounds.");
    return { ...m, usage: { ...m.usage, output_tokens: out } };
  };
  let msg;
  try {
    msg = await send(params);
  } catch (e) {
    if (!schema || !/format|schema|output_config/i.test(String(e))) throw e;
    msg = await send({ ...params, output_config: { effort: "medium" } });
  }
  if (msg.stop_reason === "refusal") throw new Error(`The model declined the ${label}.`);
  used.input += msg.usage.input_tokens; used.output += msg.usage.output_tokens;
  const texts = msg.content.filter((b) => b.type === "text").map((b) => b.text);
  const raw = (texts[texts.length - 1] ?? "").match(/\{[\s\S]*\}/) ?? texts.join("\n").match(/\{[\s\S]*\}/);
  if (!raw) throw new Error(`No ${label} came back.`);
  return JSON.parse(raw[0]);
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const secs = (v) => { const p = String(v).split(":").map(Number); return p.some(Number.isNaN) ? NaN : p.reduce((a, x) => a * 60 + x, 0); };
const guest = ctx.episode?.guest || ctx.top || "the guest";
const feeds = { guest: process.env.TOP_URL || "", host: process.env.BOTTOM_URL || "" };
const stage = STAGE[String(ctx.piece?.awareness ?? "").toLowerCase()];
const BRIEF = [
  `Episode: ${ctx.episode?.title ?? ""} (${SHOW}). Guest: ${ctx.episode?.guest ?? "none"}. Host: ${st.ownerFull}.`,
  `Carousel #${ctx.piece?.num}: ${ctx.piece?.title ?? ""}`,
  stage ? `Built for ${stage}` : "",
  ctx.piece?.insight ? `The core insight: ${ctx.piece.insight}` : "",
  ctx.piece?.hook ? `Working hook: ${ctx.piece.hook}` : "",
  ctx.piece?.why ? `Why it's worth making: ${ctx.piece.why}` : "",
  ctx.piece?.outline ? `The slide plan the team kept (follow it unless the transcript or the skill says otherwise):\n${ctx.piece.outline}` : "",
  // carousels can use the training material in the brain, whatever the video asset has
  ctx.piece?.brain?.length ? `Build it out with ${O}'s training material in the brain: ${ctx.piece.brain.map((b) => `"${b}"`).join(", ")} (brain_search or brain_get_document). The moment is the spark; these give the steps, frameworks, scripts and client results. A confidential document is for understanding only and never quoted; a document where ${O} was a guest on someone else's show is for their stories and voice, never the teaching itself. Every figure keeps its owner.` : "",
  ctx.notes ? `The team's notes for this build:\n${ctx.notes}` : "",
  `Camera feeds for stills: ${[feeds.guest && `${guest} (guest)`, feeds.host && `${st.ownerFull} (host)`].filter(Boolean).join(" and ") || "none, so no episode stills"}.`,
  ctx.script?.length ? `The episode transcript around this idea (times are the episode clock, mm:ss; a long answer is stamped where it starts):\n${ctx.script.map((l) => `${clock(l.at)} ${l.who}: ${l.text}`).join("\n")}` : "",
].filter(Boolean).join("\n\n");

// ---- 1. plan the deck ------------------------------------------------------------------------------------------
const S = (o) => ({ type: "string", ...o });
const BLOCK = { type: "object", additionalProperties: false, required: ["kind", "text"], properties: { kind: S({ enum: ["p", "bold", "quote", "step"] }), text: S() } };
const PLAN = {
  type: "object", additionalProperties: false, required: ["format", "hook", "story", "slides", "stills", "picture", "photo", "notes"],
  properties: {
    format: S({ enum: ["story", "artifact"] }),
    hook: S(),
    story: { type: "object", additionalProperties: false,
      required: ["chip", "cover", "slides", "save_slide", "save_text", "outro_headline", "cta", "follow_topic", "credit"],
      properties: {
        chip: S(),
        cover: { type: "object", additionalProperties: false, required: ["top", "key", "bottom", "sticker", "focus_x", "focus_y"],
          properties: { top: S(), key: S(), bottom: S(), sticker: S(), focus_x: { type: "number" }, focus_y: { type: "number" } } },
        slides: { type: "array", items: { type: "object", additionalProperties: false, required: ["blocks"], properties: { blocks: { type: "array", items: BLOCK } } } },
        save_slide: { type: "integer" }, save_text: S(), outro_headline: S(), cta: S(), follow_topic: S(), credit: S(),
      } },
    slides: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "format", "copy", "visual"],
      properties: { name: S(), format: S(), copy: { type: "array", items: S() }, visual: S() } } },
    stills: { type: "array", items: { type: "object", additionalProperties: false, required: ["who", "at", "for"],
      properties: { who: S({ enum: ["guest", "host"] }), at: S(), for: S() } } },
    picture: S(),
    photo: S(),
    notes: S(),
  },
};
const STORY_RULES = `Story mode (the default). Fill "story" and leave "slides" empty.
- chip: the episode type or show, from what the episode is: "Free coaching session", "Masterclass", "Expert guest" or
  "${st.show || "the show's name"}" ("${st.ownerFull}" for a standalone idea or a piece from the training material).
- cover: the hook as three lines read together as one sentence: top (a few words, at most 20 characters), key (the 1 to 3
  loaded words set huge in caps, at most 14 characters, the one accent moment of the deck), bottom (at most 22
  characters); sticker: the subline on a white sticker (what the reader gets, at most 45 characters); focus_x and
  focus_y: where the face sits in the cover still, as percentages of its width and height (50, 40 when unsure).
- slides: the reading slides, 6 to 8 of them, in order. Each slide is 2 or 3 blocks and 120 to 220 characters in all:
  "p" a short paragraph, "bold" the slide's one line that lands (exactly one per slide, usually last), "quote" a line
  someone said, word for word in quotation marks, "step" one numbered step (steps number on their own across slides;
  at most 3 on a slide). Each slide leads to the next. Full sentences, the speakers' own words and figures, and what
  ${O} teaches in the training material named above.
- save_slide: 3 or 4, the slide (counting the cover as 1) that carries the save pill; save_text: "Save this for ..."
  with something specific to the topic, at most 40 characters.
- outro_headline: the last slide's headline, tied to the topic, at most 60 characters (a question is fine).
- cta: the outro's button, the call to action the brand brief (or the "${DOCS.carousels}" doc) names, at most 40
  characters${st.bookingUrl ? ` (it leads to the booking page, ${st.bookingUrl})` : ""}; empty when the brain names none.
- follow_topic: what they get more of by following, at most 24 characters ("Follow ${st.handle || "us"} for more <it> like this.").
- credit: the guest's full name when the idea or the story is the guest's, otherwise empty.
- stills: 1 to 3, the best one for the cover ("for": "cover"): the guest or the host mid-gesture on the moment the hook
  comes from. Scan a few seconds around it (the skill's B-roll section).
- picture: when there are no camera feeds (an idea, or a piece from the training material), one plain description of a
  photo for the cover's framed window, generated for this deck: one real object or place from the topic (a microphone
  on a desk, a calendar with one day circled, a coffee cup next to a notebook), plain enough to read at thumbnail size.
  Never a person, a face or hands, never words or numbers, never a logo. Empty when a still is used.`;
const ARTIFACT_RULES = `Artifact mode (only when the idea is a thing to show). Fill "slides" and leave the story fields empty strings, an
empty slides list and 0. Pick the format from the skill's format library, 4 to 9 slides, a typical arc with the guest
credited and a take slide for ${O} drafted from what ${O} says in the transcript (flag it as a placeholder for ${O} to
rewrite). No call-to-action slide: the app adds the outro as the last slide. For each slide: a file name
("01-cover", "02-on-the-show"...), its format, every line of visible copy after the delivery gate, and what's on it
visually. Then up to 8 stills: who (guest or host), the second (mm:ss on the episode clock) and which slide it's for; a
quote over the frame uses the second the line was said.`;
const PHOTO_RULES = `photo: for the outro's small round portrait, call photo_pick (format "cover", limit 3) and return the full_url of
the friendliest face-forward photo of ${O}; then log it with photo_use (photos: [its name], format "cover", post: the
deck's hook, status "delivered"). Empty when photo_pick returns none (the outro then shows ${O}'s initial).`;

const plan = TEST ?? await ask(`${BRIEF}

Plan the deck. First pick the format: "story" unless the idea is a thing to show.

${STORY_RULES}

${ARTIFACT_RULES}

${PHOTO_RULES}

hook: the deck's hook as one plain sentence. notes: one or two plain sentences for the team on what you decided. Answer
with the JSON only.`, PLAN, "deck plan");
const story = plan.format !== "artifact";
if (story && !(plan.story?.slides ?? []).length) throw new Error("The plan came back with no reading slides.");
say(story
  ? `plan (story: cover + ${Math.min(plan.story.slides.length, MAX - 2)} reading slides + outro; ${plan.stills?.length ?? 0} stills asked)`
  : `plan (artifact: ${Math.min(plan.slides.length, MAX - 1)} slides: ${[...new Set(plan.slides.map((s) => s.format))].join(", ")} + outro; ${plan.stills?.length ?? 0} stills asked)`);

// ---- 2. stills from the camera feeds, at full resolution -------------------------------------------------------
const stills = [];
for (const s of (plan.stills ?? []).slice(0, story ? 3 : 8)) {
  const url = feeds[s.who], at = secs(s.at);
  if (!url || !Number.isFinite(at)) continue;
  const name = `${s.who}-${String(s.at).replace(/:/g, "")}.jpg`;
  if (stills.some((x) => x.name === name)) continue;
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(at), "-i", url, "-frames:v", "1", "-q:v", "2", path.join(ASSETS, name)], { timeout: 120000 });
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(ASSETS, name), "-vf", "scale=640:-2", "-q:v", "5", path.join(WORK, `thumb-${name}`)]);
    const dims = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", path.join(ASSETS, name)]).toString().trim();
    const said = [...(ctx.script ?? [])].reverse().find((l) => l.at <= at);
    stills.push({ name, who: s.who, at: s.at, for: s.for, dims, said: said ? `${said.who}: ${said.text.slice(0, 160)}` : "" });
  } catch { note(`  couldn't grab ${s.who} at ${s.at}`); }
}
say(`stills (${stills.length})`);

// ---- 2b. a generated picture for the cover when no still came through (not everything has to be a photo from the
// library: a generated picture can backfill the cover) ---------------------------------------------------------------
// On fal (FAL_KEY in the app's settings; FAL_IMAGE_MODEL picks the model). Objects and places only: no person is ever
// generated, the host least of all (a face is never made up). No key, no picture: the cover sets the hook larger instead.
const PAL = st.palette;
const PICTURE_STYLE = `Editorial photograph, natural light, real materials and textures, calm colors that sit with ${PAL.primary} tones and one small ${PAL.accent} accent, shallow depth of field, uncluttered. No people, no faces, no hands, no text, no letters, no numbers, no logos, no screens showing words.`;
let picture = null;
if (story && !stills.length && String(plan.picture ?? "").trim() && process.env.FAL_KEY) {
  try {
    const model = process.env.FAL_IMAGE_MODEL || "fal-ai/flux-pro/v1.1";
    const r = await fetch(`https://fal.run/${model}`, {
      method: "POST",
      headers: { authorization: `Key ${process.env.FAL_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt: `${String(plan.picture).trim()}. ${PICTURE_STYLE}`, image_size: "landscape_4_3", num_images: 1, output_format: "jpeg", enable_safety_checker: true }),
    });
    if (!r.ok) throw new Error(`fal ${r.status}: ${(await r.text()).replace(/Key\s+\S+/g, "Key [key]").slice(0, 160)}`);
    const url = (await r.json()).images?.[0]?.url;
    if (!url) throw new Error("fal returned no image");
    const img = await fetch(url);
    if (!img.ok) throw new Error(`the picture didn't download (${img.status})`);
    fs.writeFileSync(path.join(ASSETS, "picture-cover.jpg"), Buffer.from(await img.arrayBuffer()));
    const dims = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", path.join(ASSETS, "picture-cover.jpg")]).toString().trim();
    picture = { name: "picture-cover.jpg", who: "picture", at: "", for: "cover", dims, said: "" };
    say(`picture (generated for the cover: ${String(plan.picture).slice(0, 80)})`);
  } catch (e) { note(`  no generated picture (${String(e?.message ?? e).slice(0, 160)})`); }
} else if (story && !stills.length && String(plan.picture ?? "").trim()) note("  no FAL_KEY in the app's settings, so no generated picture for the cover");

// ---- the host's portrait for the outro (one of their own photos, from photo_pick) ----------------------------------
let portrait = null;
if (/^https:\/\//.test(String(plan.photo ?? "").trim())) {
  try {
    const r = await fetch(String(plan.photo).trim().replace(/&amp;/g, "&"));
    if (!r.ok) throw new Error(`status ${r.status}`);
    const ext = /png/.test(r.headers.get("content-type") ?? "") ? "png" : "jpg";
    portrait = `host-photo.${ext}`;
    fs.writeFileSync(path.join(ASSETS, portrait), Buffer.from(await r.arrayBuffer()));
  } catch (e) { portrait = null; note(`  no portrait for the outro (${String(e?.message ?? e).slice(0, 80)}), so the initial instead`); }
}

// ---- the template: the story slides and the outro every deck ends on --------------------------------------------
// The palette (context.json studio.palette): the primary colour for the cover and the outro, the accent for the cover's
// key words and the button, the soft tint for the reading slides. The neutrals stay as they are.
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
const HARBOR = PAL.primary, INK = "#0c1a24", INK0 = "#0f0f0f", SOFT = PAL.soft, TEXT = "#3a4651", DEEP = PAL.primary, MIST = "#eef2f5", YEL = PAL.accent;
const ON_YEL = lum(YEL) > 140 ? INK : "#ffffff";
// written onto every slide after kit.css, so the kit's parts take the studio's colours too
const PALCSS = `<style>:root { --primary: ${PAL.primary}; --accent: ${PAL.accent}; --dark: ${PAL.ink}; --paper: ${PAL.paper}; --tint: ${PAL.soft}; --fill-ink: ${lum(PAL.primary) > 150 ? INK : "#ffffff"}; --accent-ink: ${ON_YEL}; }</style>`;
const HANDLE = esc0(st.handle);
const CTA = String(plan.story?.cta ?? "").trim() || (st.bookingUrl ? "Book a call" : "Get in touch");
const HOSTLINE = SHOW !== "the show" ? `Host of ${SHOW}` : st.brand;
// the voice gate's mechanical part: no em or en dashes anywhere in the copy
const clean = (s) => String(s ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
const esc = (s) => clean(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function esc0(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
const ARROW = `<svg width="56" height="28" viewBox="0 0 56 28"><path d="M2 14h48M38 3l12 11-12 11" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// Shrinks marked text in the browser before the screenshot (render.py gives Chrome a virtual time budget, so this runs
// once the fonts are in) and records on <body> whether anything still overflows, for the check after rendering.
const FIT = `<script>
document.fonts.ready.then(function () {
  var over = false;
  document.querySelectorAll('[data-w]').forEach(function (el) {           // one line that must fit its box
    var s = parseFloat(getComputedStyle(el).fontSize), min = +el.dataset.min || 40;
    while (el.scrollWidth > el.clientWidth + 1 && s > min) { s -= 2; el.style.fontSize = s + 'px'; }
    if (el.scrollWidth > el.clientWidth + 1) over = true;
  });
  document.querySelectorAll('[data-h]').forEach(function (el) {           // a block that must end above a line
    var lim = +el.dataset.h, stop = document.querySelector(el.dataset.stop || '#none');
    if (stop) lim = Math.min(lim, stop.getBoundingClientRect().top - 36);
    var sizes = (el.dataset.sizes || '').split(',').map(Number).filter(Boolean), i = 0;
    while (el.getBoundingClientRect().bottom > lim && i < sizes.length) { el.style.fontSize = sizes[i++] + 'px'; }
    if (el.getBoundingClientRect().bottom > lim || el.scrollWidth > el.clientWidth + 1) over = true;
  });
  document.body.setAttribute('data-overflow', over ? '1' : '0');
});
</script>`;
const head = (bg, fg) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${KITCSS}">${PALCSS}<style>
body { background: ${bg}; color: ${fg}; }
.dots { background-image: radial-gradient(rgba(255,255,255,.075) 2.2px, transparent 2.6px); background-size: 38px 38px; }
.txt { position: absolute; left: 96px; right: 96px; top: 150px; font-size: 58px; line-height: 1.3; letter-spacing: -.01em; }
.txt p { margin-bottom: 48px; }
.txt b { color: ${INK}; font-weight: 600; }
.txt .say { color: ${INK}; font-weight: 500; }
.txt .n { display: grid; grid-template-columns: 1.4em 1fr; margin-bottom: 40px; }
.txt .n i { font-style: normal; font-family: var(--head); font-weight: 800; color: ${DEEP}; }
.foot2 { position: absolute; left: 96px; right: 96px; bottom: 70px; display: flex; justify-content: space-between; align-items: center; font-size: 24px; }
.foot2 .go { display: flex; align-items: center; gap: 18px; }
.save { position: absolute; left: 96px; bottom: 170px; border: 3px solid ${INK}; border-radius: 6px; padding: 18px 28px; font-size: 32px; color: ${INK}; font-weight: 500; }
.chip2 { position: absolute; left: 80px; top: 84px; background: ${INK0}; color: #fff; font-family: var(--head); font-weight: 800; font-size: 26px; letter-spacing: .07em; text-transform: uppercase; padding: 14px 22px; border-radius: 6px; }
.one { white-space: nowrap; overflow: hidden; }
</style></head>`;

const sc = plan.story ?? {};
const credit = clean(sc.credit);
const coverStill = story ? (stills.find((s) => /cover/i.test(s.for)) ?? stills.find((s) => s.who === "guest") ?? stills[0] ?? picture) : null;

function cover(total) {
  const c = sc.cover ?? {};
  const chip = esc(sc.chip || st.show || st.ownerFull);
  const line = (txt, size) => txt ? `<div class="one" data-w data-min="44" style="font-family:var(--head);font-weight:800;font-size:${size}px;line-height:1.05;letter-spacing:-.02em">${esc(txt)}</div>` : "";
  const big = (size) => `<div class="one" data-w data-min="80" style="font-family:var(--head);font-weight:900;font-size:${size}px;line-height:.95;letter-spacing:-.03em;text-transform:uppercase;color:${YEL};margin:16px 0 12px">${esc(c.key)}</div>`;
  const sticker = (top) => c.sticker ? `<div class="abs" style="right:70px;top:${top}px;transform:rotate(3deg);background:#fff;color:${INK};border:4px solid ${INK0};box-shadow:10px 10px 0 ${INK0};padding:22px 30px;font-family:var(--head);font-weight:800;font-size:40px;line-height:1.1;max-width:600px">${esc(c.sticker)}</div>` : "";
  let body;
  if (coverStill) {
    // the still fills the window at its own size or smaller: a crop around the face, never blown up
    const [w] = coverStill.dims.split("x").map(Number);
    const bw = Math.min(1085, w || 1085), fx = Number.isFinite(c.focus_x) ? Math.max(0, Math.min(100, c.focus_x)) : 50, fy = Number.isFinite(c.focus_y) ? Math.max(0, Math.min(100, c.focus_y)) : 40;
    body = `<div class="abs" style="left:80px;right:80px;top:180px">${line(c.top, 72)}${big(134)}${line(c.bottom, 72)}</div>
<div class="abs" style="left:96px;top:580px;transform:rotate(-2deg)"><div style="width:780px;height:543px;border:14px solid #fff;box-shadow:18px 18px 0 ${INK0};background:#000 url('../assets/${coverStill.name}') ${fx}% ${fy}% / ${bw}px auto no-repeat"></div></div>
${sticker(1060)}`;
  } else {
    body = `<div class="abs" style="left:80px;right:80px;top:300px">${line(c.top, 92)}${big(176)}${line(c.bottom, 92)}</div>
${sticker(840)}`;
  }
  return `${head(HARBOR, "#fff")}<body class="dots">
<div class="chip2">${chip}</div>
${body}
<div class="foot2" style="color:${MIST}"><div style="font-weight:500">${HANDLE}</div><div class="go">${ARROW}</div></div>
${FIT}</body></html>`;
}

let stepN = 0;
function reading(blocks, n, total, save) {
  const out = [];
  for (const b of blocks) {
    const t = esc(b.text);
    if (!t) continue;
    if (b.kind === "step") { out.push(`<div class="n"><i>${++stepN}</i><div>${t}</div></div>`); continue; }
    out.push(b.kind === "bold" ? `<p><b>${t}</b></p>` : b.kind === "quote" ? `<p><span class="say">${t}</span></p>` : `<p>${t}</p>`);
  }
  const pill = save ? `<div class="save" id="save">${esc(save)}</div>` : "";
  return `${head(SOFT, TEXT)}<body>
<div class="txt" data-h="1140" data-stop="${save ? "#save" : ".foot2"}" data-sizes="54,50,46,44">${out.join("\n")}</div>
${pill}
<div class="foot2" style="color:#5f6b76"><div>${[HANDLE, credit ? `with ${esc(credit)}` : ""].filter(Boolean).join(" &middot; ")}</div><div class="go" style="color:${DEEP}"><span style="color:#5f6b76">${n} / ${total}</span>${ARROW}</div></div>
${FIT}</body></html>`;
}

function outro(total) {
  const headline = esc(sc.outro_headline || "Want help turning this into clients?");
  const topic = clean(sc.follow_topic).replace(/^more\s+/i, "").replace(/\s+like this\.?$/i, "");
  const face = portrait
    ? `<img src="../assets/${portrait}" style="width:132px;height:132px;border-radius:50%;object-fit:cover">`
    : `<div style="width:132px;height:132px;border-radius:50%;background:${YEL};color:${ON_YEL};display:flex;align-items:center;justify-content:center;font-family:var(--head);font-weight:800;font-size:64px">${esc(st.ownerFull.slice(0, 1).toUpperCase())}</div>`;
  return `${head(HARBOR, "#fff")}<body class="dots">
<div class="abs" style="left:80px;top:96px;display:flex;align-items:center;gap:26px">
  ${face}
  <div style="font-size:30px;line-height:1.3;color:${MIST}"><b style="font-weight:600;color:#fff">${esc(st.ownerFull)}</b><br>${esc(HOSTLINE)}</div>
</div>
<div class="abs" id="oh" data-h="650" data-sizes="84,76,68" style="left:80px;right:80px;top:300px;font-family:var(--head);font-weight:800;font-size:92px;line-height:1.02;letter-spacing:-.03em">${headline}</div>
<div class="abs" style="left:80px;right:92px;top:700px;background:${YEL};color:${ON_YEL};border:4px solid ${INK};box-shadow:12px 12px 0 ${INK};padding:36px 44px">
  <div style="font-family:var(--head);font-weight:800;font-size:56px;line-height:1.08">${esc(CTA)}</div>
  <div style="font-size:34px;margin-top:14px;font-weight:600">Link in bio</div>
</div>
<div class="abs" data-h="1215" data-sizes="32,30" style="left:80px;right:80px;top:1010px;font-size:34px;line-height:1.45;font-weight:500;color:${MIST}">
  <div>Save this post for later.</div>
  <div>Follow ${HANDLE ? `${HANDLE} ` : ""}for more ${esc(topic || "ideas")} like this.</div>
</div>
<div class="foot2" style="color:${MIST}"><div style="font-weight:500">${HANDLE}</div><div class="go"><span>${total} / ${total}</span></div></div>
${FIT}</body></html>`;
}

// ---- 3. write the slides ---------------------------------------------------------------------------------------
const SLIDES_OUT = {
  type: "object", additionalProperties: false, required: ["slides", "notes"],
  properties: {
    slides: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "html"], properties: { name: S(), html: S() } } },
    notes: S(),
  },
};
const RULES = `Each slide is one complete HTML document for a 1080x1350 canvas, built from the kit's parts like the examples.
Link the kit exactly as <link rel="stylesheet" href="kit.css"> (it's rewritten to the real path). Episode stills are
../assets/<file name>. A photo of ${O} from photo_pick goes in by the https URL the tool returns (it's downloaded before
rendering). No other remote files, no scripts, no web fonts beyond the kit's. Frame faces the way a photographer would:
the whole head with a little room above it and the full chin, eyes about a third from the top; a still fills a box its
own size or smaller (use background-size and background-position, or a smaller box, never a blown-up face).`;

// Real paths for the kit, local copies of remote photos, nothing that runs.
let remote = 0;
async function localize(html) {
  let out = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<link([^>]*)href="[^"]*kit\.css"([^>]*)>/g, `<link$1href="${KITCSS}"$2>${PALCSS}`);
  const urls = [...new Set([...out.matchAll(/https:\/\/[^"')\s]+/g)].map((m) => m[0]))];
  for (const u of urls) {
    try {
      const r = await fetch(u.replace(/&amp;/g, "&"));
      if (!r.ok) continue;
      const ext = /png/.test(r.headers.get("content-type") ?? "") ? "png" : "jpg";
      const name = `photo-${++remote}.${ext}`;
      fs.writeFileSync(path.join(ASSETS, name), Buffer.from(await r.arrayBuffer()));
      out = out.split(u).join(`../assets/${name}`);
    } catch { /* a photo that won't download renders as an empty box; the check step sees it */ }
  }
  return out;
}
const safe = (n, i) => `${String(i + 1).padStart(2, "0")}-${String(n).replace(/^\d+[-_]?/, "").replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "slide"}`;

let deck = [], built = { notes: "" };
const copyOf = [];
function writeStory() {
  const reads = sc.slides.slice(0, MAX - 2);
  const total = reads.length + 2;
  const saveAt = Math.max(3, Math.min(4, Number(sc.save_slide) || 3, total - 1));
  let saveText = clean(sc.save_text);
  if (!/^save this/i.test(saveText)) saveText = saveText ? `Save this for ${saveText.replace(/^for\s+/i, "")}` : "Save this for later";
  stepN = 0;
  deck = [{ name: "01-cover", html: cover(total) }];
  copyOf.length = 0;
  copyOf.push({ name: "01-cover", format: "story cover", copy: [sc.chip, sc.cover?.top, sc.cover?.key, sc.cover?.bottom, sc.cover?.sticker].map(clean).filter(Boolean) });
  reads.forEach((s, i) => {
    const n = i + 2, name = `${String(n).padStart(2, "0")}-read`;
    deck.push({ name, html: reading(s.blocks ?? [], n, total, n === saveAt ? saveText : "") });
    copyOf.push({ name, format: "story", copy: [...(s.blocks ?? []).map((b) => clean(b.text)), ...(n === saveAt ? [saveText] : [])].filter(Boolean) });
  });
  const last = `${String(total).padStart(2, "0")}-outro`;
  deck.push({ name: last, html: outro(total) });
  copyOf.push({ name: last, format: "outro", copy: [clean(sc.outro_headline), clean(CTA), "Link in bio", "Save this post for later.", `Follow ${st.handle ? `${st.handle} ` : ""}for more ${clean(sc.follow_topic)} like this.`] });
}

if (story) {
  writeStory();
  for (const s of deck) fs.writeFileSync(path.join(SLIDES, `${s.name}.html`), s.html);
} else {
  const images = stills.flatMap((s) => [
    { type: "text", text: `${s.name}: ${s.who === "guest" ? guest : st.ownerFull} at ${s.at}, ${s.dims} full size, for ${s.for}. Said around then: ${s.said}` },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(path.join(WORK, `thumb-${s.name}`)).toString("base64") } },
  ]);
  const slidesPlan = { ...plan, story: undefined, slides: plan.slides.slice(0, MAX - 1) };
  built = await ask([
    { type: "text", text: `${BRIEF}\n\nThe deck plan:\n${JSON.stringify(slidesPlan, null, 1)}\n\nThe stills (small previews here; the files are full size):` },
    ...images,
    { type: "text", text: `${images.length ? "" : "No stills came through, so design without episode stills.\n\n"}Write every slide of the plan. No call-to-action slide: the app adds the outro. ${RULES}\nnotes: one plain sentence on anything the team should know. Answer with the JSON only.` },
  ], SLIDES_OUT, "slides");
  deck = (built.slides ?? []).slice(0, MAX - 1).map((s, i) => ({ name: safe(s.name, i), html: s.html }));
  if (deck.length < 2) throw new Error("The builder returned fewer than two slides.");
  for (const s of deck) fs.writeFileSync(path.join(SLIDES, `${s.name}.html`), await localize(s.html));
  const total = deck.length + 1, last = `${String(total).padStart(2, "0")}-outro`;
  deck.push({ name: last, html: outro(total) });
  fs.writeFileSync(path.join(SLIDES, `${last}.html`), deck[deck.length - 1].html);
  copyOf.push(...plan.slides.slice(0, MAX - 1).map((s) => ({ name: s.name, format: s.format, copy: s.copy })), { name: last, format: "outro", copy: [clean(sc.outro_headline)] });
}
say(`slides written (${deck.length}, ${story ? "story" : "artifact"})`);

// ---- 4. render, then check ---------------------------------------------------------------------------------------
const render = () => {
  fs.rmSync(PNG, { recursive: true, force: true }); fs.mkdirSync(PNG, { recursive: true });
  execFileSync("python3", [path.join(KIT, "scripts/render.py"), SLIDES, "--out", PNG], { stdio: "pipe", timeout: 600000 });
};
// The template's own fit script marks a slide whose text still runs past its line at the smallest size; read the mark
// back from the page Chrome laid out (same Chrome and window as render.py).
const DOM = `import pathlib, subprocess, sys
sys.path.insert(0, sys.argv[1])
import render as r
c, shell = r.find_chrome()
for f in sys.argv[2:]:
    out = subprocess.run(r.chrome_args(c, shell) + ['--allow-file-access-from-files', '--virtual-time-budget=4000', '--window-size=1080,1350', '--dump-dom', pathlib.Path(f).resolve().as_uri()], capture_output=True, text=True, timeout=120).stdout
    print(pathlib.Path(f).stem, '1' if 'data-overflow="1"' in out else ('0' if 'data-overflow="0"' in out else '?'))`;
const overflowing = () => {
  const files = deck.map((s) => path.join(SLIDES, `${s.name}.html`));
  const out = execFileSync("python3", ["-c", DOM, path.join(KIT, "scripts"), ...files], { timeout: 600000 }).toString();
  return out.split("\n").map((l) => l.trim().split(" ")).filter((p) => p[1] === "1").map((p) => p[0]);
};
render();
say("render");

let check = { verdict: "not checked", fixes: [] };
if (story) {
  // the template draws every slide, so the one thing to check is copy that won't fit; a slide still over at the
  // smallest size gets one rewrite (shorter, same meaning), then renders again
  try {
    let over = overflowing();
    if (over.length && !TEST) {
      const idx = over.map((n) => deck.findIndex((d) => d.name === n)).filter((i) => i > 0 && i < deck.length - 1);
      if (idx.length) {
        const SHORT = { type: "object", additionalProperties: false, required: ["slides"], properties: { slides: { type: "array", items: { type: "object", additionalProperties: false, required: ["slide", "blocks"], properties: { slide: { type: "integer" }, blocks: { type: "array", items: BLOCK } } } } } };
        const r = await ask(`${BRIEF}\n\nThese reading slides run past the bottom of the slide even at the smallest type. Rewrite each one shorter
(at most 170 characters in all, 2 or 3 blocks, exactly one "bold"), same meaning, same speakers' words and figures,
the same voice rules. slide is the slide number (the cover is 1).\n\n${idx.map((i) => `Slide ${i + 1}:\n${JSON.stringify(sc.slides[i - 1].blocks)}`).join("\n\n")}\n\nAnswer with the JSON only.`, SHORT, "shorter slides");
        for (const f of r.slides ?? []) if (f.slide >= 2 && f.slide - 2 < sc.slides.length && f.blocks?.length) sc.slides[f.slide - 2].blocks = f.blocks;
        writeStory();
        for (const s of deck) fs.writeFileSync(path.join(SLIDES, `${s.name}.html`), s.html);
        render();
        over = overflowing();
      }
    }
    check.verdict = over.length ? `Copy still too long on ${over.join(", ")}.` : "Every slide fits.";
    say(`check (${over.length ? `still over: ${over.join(", ")}` : "every slide fits"})`);
  } catch (e) {
    note(`  check skipped: ${String(e.message ?? e).slice(0, 160)}`);
  }
} else {
  try {
    const CHECK = {
      type: "object", additionalProperties: false, required: ["verdict", "fixes"],
      properties: {
        verdict: S(),
        fixes: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "why", "html"], properties: { name: S(), why: S(), html: S() } } },
      },
    };
    const mine = deck.slice(0, -1);   // the outro is the app's
    const views = mine.flatMap((s) => {
      const small = path.join(WORK, `view-${s.name}.jpg`);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(PNG, `${s.name}.png`), "-vf", "scale=720:-2", "-q:v", "4", small]);
      return [
        { type: "text", text: `${s.name}.html as rendered (720 px wide here; the real slide is 1080x1350). Its HTML:\n${fs.readFileSync(path.join(SLIDES, `${s.name}.html`), "utf8")}` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: fs.readFileSync(small).toString("base64") } },
      ];
    });
    check = await ask([
      { type: "text", text: `${BRIEF}\n\nYou built this deck. Look at every rendered slide the way the skill's Phase 4 says: overlaps, text cut at an edge or running into another part, dead bands of empty space, text under about 24 px, faces cropped badly (too zoomed, chin or head cut off, soft from being blown up), a photo box that came out empty, the guest credit missing, copy that breaks the voice guardrails.` },
      ...views,
      { type: "text", text: `For each slide that needs it, return the whole corrected HTML (same name). Leave good slides out. ${RULES}\nverdict: one plain sentence on the deck as it now stands. Answer with the JSON only.` },
    ], CHECK, "check");
    let fixed = 0;
    // a fix names its slide like the files ("03-the-email"); match on the name without its number if it drifted
    const key = (n) => String(n).replace(/\.html$/, "").toLowerCase();
    const bare = (n) => key(n).replace(/^\d+[-_]?/, "");
    for (const f of check.fixes ?? []) {
      const s = mine.find((d) => d.name === key(f.name)) ?? mine.find((d) => bare(d.name) === bare(f.name));
      if (!s || !f.html) continue;
      fs.writeFileSync(path.join(SLIDES, `${s.name}.html`), await localize(f.html));
      fixed++;
    }
    if (fixed) render();
    say(`check (${fixed} slide(s) fixed)`);
  } catch (e) {
    note(`  check skipped: ${String(e.message ?? e).slice(0, 160)}`);
  }
}

const files = fs.readdirSync(PNG).filter((f) => f.endsWith(".png") && f !== "contact-sheet.png").sort().slice(0, MAX);
fs.writeFileSync(path.join(DECK, "deck.json"), JSON.stringify({
  format: story ? "story" : "artifact",
  slides: files.map((f) => f.replace(/\.png$/, "")), count: files.length, hook: plan.hook,
  copy: copyOf,
  stills: stills.map(({ name, who, at, for: f }) => ({ name, who, at, for: f })),
  notes: [plan.notes, built.notes, check.verdict && check.verdict !== "not checked" ? `Check: ${check.verdict}` : ""].filter(Boolean).join(" "),
  usage: used,
}, null, 1));
note(`deck: ${files.length} slides (${story ? "story" : "artifact"}); ${used.input} in / ${used.output} out tokens`);
if (plan.notes) note(`builder's note: ${plan.notes}`);
