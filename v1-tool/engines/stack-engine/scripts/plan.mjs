// The edit plan: Claude reads the clip's word timings and the studio's brand (from the brain), then decides the cut, the
// hook, the name card, the graphics, the lines worth a slow push, the caption keywords and the end card. Writes
// plan.json + cutlist.json. The look itself (camera, caption motion, how each box builds) is fixed in build_auto.py.
// A revision (context.previous + context.change) starts from the edit the team liked and changes only what they asked.
// A first edit goes past the coach before anything is cut (a filter it goes through first, so there are fewer
// suggestions and fewer edits along the way): the coach reads the plan, and the editor makes the coach's fixes.
// Run from the reel folder after transcribe_chunks.py. Needs ANTHROPIC_API_KEY, BRAIN_MCP_URL and BRAIN_MCP_TOKEN.
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import { brain, brainRules, DOCS, MODEL, studioOf } from "./studio.mjs";

const ctx = JSON.parse(fs.readFileSync("context.json", "utf8"));
const words = JSON.parse(fs.readFileSync("work/words_chunked.json", "utf8")).words;
const DUR = Number(ctx.duration) || Math.max(...words.map((w) => w.end), 1);
const BRAIN = brain();
if (!process.env.ANTHROPIC_API_KEY || !BRAIN) throw new Error("The edit plan needs the Claude key and the brain connection (BRAIN_MCP_URL, BRAIN_MCP_TOKEN).");
const st = studioOf(ctx);
const O = st.owner, C = st.coach;
const SHOW = ctx.show || ctx.episode?.show || st.show || "the show";

const str = { type: "string" }, num = { type: "number" };
const obj = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const SCHEMA = obj({
  segments: { type: "array", items: obj({ in: num, out: num, text: str }) },
  hook: obj({ text: str, until: num }),
  name: obj({ name: str, line: str, at: num, until: num }),
  graphics: { type: "array", items: obj({
    kind: { type: "string", enum: ["list", "stat", "message", "compare", "tag", "clones", "checklist", "screen", "orbit", "wall",
      "headlines", "chart", "cover", "glass", "paper", "doodle", "frame"] },
    title: str, label: str, text: str, value: str, at: num, until: num,
    rows: { type: "array", items: obj({ text: str, at: num }) },
    lines: { type: "array", items: str },
    bars: { type: "array", items: obj({ label: str, value: num, at: num }) },
    app: { type: "string", enum: ["", "email", "dm", "linkedin", "text"] },
    device: { type: "string", enum: ["", "split", "phone", "behind"] },
  }) },
  emphasis: { type: "array", items: obj({ at: num, until: num }) },
  punches: { type: "array", items: obj({ at: num, until: num }) },
  transitions: { type: "array", items: obj({ at: num, kind: { type: "string", enum: ["zoom", "straight"] } }) },
  vertigo: { type: "array", items: obj({ at: num, until: num }) },
  ending: { type: "string", enum: ["card", "pullback"] },
  keys: { type: "array", items: str },
  fixes: { type: "array", items: obj({ at: num, from: str, to: str }) },
  end: obj({ name: str, line: str, cta: str, url: str }),
  notes: str,
});

const stack = ctx.layout === "stack";
// the approved edit, already lined up with this clip by the app, and the team's changes
const prev = ctx.previous && typeof ctx.previous === "object" && String(ctx.change ?? "").trim() ? ctx.previous : null;
// an edit made before the effect library had none of its moves: say so, so a change doesn't add them unasked
if (prev) for (const [k, v] of [["punches", []], ["transitions", []], ["vertigo", []], ["ending", "card"]]) if (!(k in prev)) prev[k] = v;
const editorSystem = (rev) => `You are the reel editor in ${st.brand}'s content studio. You edit one clip into a reel in the
studio's look: cut tight, natural footage, one face at a time (the camera cuts to whoever is talking), captions that
pop in word by word, three or four graphics in the brand's boxes shown large above the speaker in a framed window, and an
end card. Here you decide the edit; a fixed builder renders the look.

Start by calling get_brand_brief, then read the brain doc "${DOCS.reel}" and the "${DOCS.guardrails}" (brain_search,
brain_get_document). The brain wins over anything here. ${brainRules(st)} On-screen words use the speakers' own words
wherever they fit and follow the ${DOCS.guardrails} (no em dashes).

The clip: ${stack ? `two camera feeds stacked to 9:16: ${ctx.top || "the guest"} on top, ${ctx.bottom || O} underneath. The
builder shows one face at a time, cutting to whoever is talking; a graphic opens that speaker into a framed window low on
the screen with the box large above it.` : "one 9:16 frame. A graphic opens the speaker into a framed window low on the screen with the box large above it."}
A box is about 880 px wide with big type: a title of 1 to 3 words on one line, a list of at most four short rows.

What to return (every time in seconds of the clip as given, matching the word timings):
- segments: the cut, in order. Keep the best take of each line; drop false starts, restarts, filler and pauses longer
  than about half a second (put each boundary in the pause between words). Keep the speakers' words and their order.
  Start on a line that hooks; end where the point lands. Aim for 20 to 60 seconds. text: the kept words, short.
  ${C}, who reviews every reel before ${O} sees it, fails any piece with nothing of ${O} in it (the host test).
  So when ${O} makes their own point in the clip (not just "yeah" or "great"), keep their best take of it, usually as
  the ending, even if the reel runs to about 80 seconds; cut the guest's setup harder instead. The speaker map comes from
  the transcript and can be off by a few seconds where one person hands over to the other.
- hook: an optional bar over the opening seconds: a plain short sentence a founder would say, with a number and an
  outcome from what's said (the money or number that makes it land), at most about 40 characters (it wraps to two
  lines). Never a fragment label or the guest's jargon. A number keeps what the speaker attached to it ("a month",
  "a year", "per lead"), and an example stays an example; to fit, cut other words, never those. until: when it
  should go (about the end of the first sentence). Empty text for none.
- name: the guest's name card when they first speak (name, and one short line on who they are, from the brand brief
  or the episode; never guess a company). at/until: about 5 seconds. Empty name when ${O} is the only speaker.
- graphics: three to five, each on one of the strongest lines (at most five, at most one tag, at most one clones, never
  the same kind twice). Pick the kind from what is said, the way a good editor would, and vary them: a reel of three
  lists is the weak, samey edit. Use the effect library: in a reel of 40 seconds or more, at least two of the graphics
  are effects (checklist, screen,
  orbit, wall, headlines, chart, cover, glass, paper, doodle, frame) rather than plain boxes. At most three put
  something behind the speaker (orbit, wall, headlines, chart, cover, glass, paper, doodle, frame, screen "behind", and
  vertigo below): each of those makes a cut-out of the speaker and keeps the camera on one face, so put them where one
  person talks for the whole stretch. An effect still has to show what is said, never decorate. Every word and number
  comes from the episode transcript, in the speaker's words. The builder decides how each box builds; leave space
  between graphics (a second or more of plain talking head). Fill unused fields with "", 0 or [].
  Boxes (a box large above the speaker's window):
  - list: the speaker names things one after another. title 1 to 3 words; rows 1 to 3 words each, at = when each is
    said (in single layout, label = an optional short line under the title).
  - stat: the speaker says a number that matters. value = the number as said ("$10,000", "40%", "3x"; it counts up
    on screen), label = what it measures in a few of their words, title optional (1 to 2 words). at = when the
    number is said.
  - message: the speaker reads out or describes a message, email, DM or script they send. lines = the message in
    their exact words (never invented). Keep the ask itself (the request or call to action) every time; to shorten
    it, cut the lead-in or filler, never the request, title = what it is ("THE EMAIL",
    "THE DM"), label = who it's from or to ("From: Sam"), value = an optional reply-button word ("Reply"). It types
    itself in from at.
  - compare: only when the source gives real numbers for two or three things (a before and after, two rates, two
    costs). title; bars = label (a few words with the number) and value (that number); the last bar is the
    highlighted one. Never made-up values: two things contrasted in words are a list with two rows. at = when the
    comparison starts.
  - tag: a 1 to 3 word name for the thing just said ("SECOND CHANNEL", "NEW JOB"). It drops in beside the speaker's
    head on a string and swings. text = the words; at = when it's said.
  - clones: only when a speaker says something is what everyone does, generic, the same as all the others or a
    commodity ("everyone sends that", "you blend in", "one of a hundred coaches"). The camera pulls back and the speaker
    repeats across a 3 by 3 wall. title = 1 to 4 words naming the sameness in their words ("FOLLOW ME OVER HERE",
    "EVERYONE SAYS THAT"); at/until = that line, 2 to 4 seconds. Never forced: most reels have none.
  - checklist: the speaker tells someone what to do, step by step ("do this, then reply and let me know"). title 1 to 3
    words; rows = each step in their words (2 to 5 words), at = when said. Each ticks off and a counter counts up. Use
    it instead of a list when the items are actions.
  The effect library (each 3 to 6 seconds):
  - screen: the speaker reads out or describes a message someone sees in an app: an email, a DM, a LinkedIn request, a
    text. app = email | dm | linkedin | text; lines = the message in their exact words (keep the ask); label = who it's
    from; title = the email's subject (email only, optional); value = an optional button word ("Reply", "Accept").
    device: "split" = the app fills the top half and the speaker sits underneath (a longer message read out word for
    word), "phone" = a phone slides in beside the speaker (a short message), "behind" = the speaker stands in front of
    the app like a green screen (when they talk about being on the platform). The plain message box is kind message.
  - orbit: two to five short names said in a row (channels, tools, places). rows = 1 or 2 words each, at = when said;
    the chips circle the speaker, passing behind and in front.
  - wall: the speaker talks about volume or everyone's content ("all the content out there", "every podcast"). A wall of
    moments from this episode fills the room behind them. title = 1 to 3 words in their words, optional.
  - headlines: things people say, ask or claim, quoted ("follow me over here", "let me know when you sent it"). rows = 2
    to 4 short quotes in the speaker's words, at = when said; each pins up behind the speaker like a clipping.
  - chart: a number that grows or changes, with at least two real values said (one channel to two, $2,000 to $10,000 a
    month). bars = the points in order: label = a few words with the number, value = the number, at = when said;
    title = what it measures (optional). Never an invented value; two things contrasted in words are not a chart.
  - cover: one idea big enough for a magazine cover. title = the masthead, one word of theirs (4 to 10 letters) that
    sits behind the speaker's head; lines = two short cover lines in their words; label = a short issue line (the
    show's name).
  - glass: one word that names the idea (title, 4 to 9 letters, their word), standing in the room behind the speaker.
  - paper: a story beat or a number that should hit hard: the room turns into a paper collage and the speaker becomes a
    cut-out sticker. title = 1 to 3 words; value = the number as said (optional, it rolls like a counter).
  - doodle: a playful or surprising line: a hand-drawn outline boils around the speaker and marks draw themselves.
    title = 1 to 3 words, optional.
  - frame: a line about posting, a profile, being seen online: the speaker shrinks into a social post and their head
    breaks out of the photo. label = the speaker's name; text = a short line they said (the post's caption).
  at: just before the graphic's first item is said; until: a second or two after its last. No graphic where nothing
  is named, counted, shown or weighed.
- punches: none, one or two single words that land hardest (a number, "gone", "free"): a hard digital zoom on the
  speaker for that word or short phrase. at/until = the word or phrase (under 3 seconds). Never inside a graphic and
  never on every cut (a camera that keeps zooming in on faces tires the eye).
- transitions: how a join between segments cuts, when it shouldn't get the usual moment of both people. kind "zoom"
  (none, one or two a reel): a zoom-blur through the cut when the reel moves to a new idea. kind "straight": a plain
  cut straight to whoever talks next, with only them in the picture, for a join where the both-people moment would
  land badly (a line that matters starts right on it, or a speaker mid-gesture). at = the start of the segment after
  the join.
- vertigo: none or one line that is a realization or a fall ("now your pathway to them is gone"): the room falls away
  while the speaker holds still. at/until = that line, 2 to 4 seconds. It counts as a behind-the-speaker effect.
- ending: "pullback" when the reel ends on a point that sends people to the full episode (the camera pulls back into
  the episode's player, then the end card), "card" for the end card alone. Most guest clips suit "pullback".
- emphasis: one or two lines that land hardest (the payoff, ${O}'s own point), each 2 to 6 seconds, where the camera
  slowly pushes in on the speaker. Not inside a graphic. Empty if nothing earns it.
- keys: 2 to 5 words that light up in the captions (the idea words).
- fixes: where the word timings mishear a word that the episode transcript has right (numbers above all, then names
  and terms), one fix each: at = the start time of the misheard word, from = the word exactly as in the timings, to =
  the right word. The captions are the speakers' words, so this is the only change allowed to them. Every number on
  screen comes from the episode transcript, never from the timings alone.
- The boxes never repeat the hook bar's words or number; each one adds something new.
- end: the end card. For a guest episode: the guest's name, "Guest on ${SHOW} with ${st.ownerFull}", cta "Full
  episode", url "Link in bio", on every guest clip, unless the "${DOCS.reel}" doc sets a different end card for guest
  clips. With no guest: ${st.ownerFull}, a short line from the brand brief, and the call to action the "${DOCS.reel}" doc or
  the brand brief names${st.bookingUrl ? ` (the booking page is ${st.bookingUrl})` : ""}; else cta "Full episode", url "Link in bio".
- notes: one or two plain sentences for the team on what you decided.
Answer with the JSON only.${rev ? `

This run is a revision: never generate a whole other reel when one has already been approved.
The team likes this edit and wrote down what to change. You get the approved edit as JSON, in this clip's seconds.
Return the same edit with only those changes made: every other segment, the hook bar, the name card, each graphic with
its words and timing, the pushes, the punches, the transitions, the vertigo, the ending, the caption keywords, the
fixes and the end card stay exactly as they are, unless a change needs one of them to move. When a change names an
effect ("put a cover story on the LinkedIn line", "add the orbit"), use that effect from the library on that line. Make the smallest edit that does what each change says. When a change asks for more
time at the start or the end, the clip carries the extra footage: extend the first or last segment into it, to where
the speaker's thought ends, with the boundary in a pause. Something cut from the approved edit comes back only when a
change asks for it. Skip a change only when it breaks a brand rule, and say so. Times in ${C}'s notes are seconds
into the finished reel; find the moment by its words. Read the brain only when a change asks for something new on
screen (a new graphic or new words); the rules above still apply. notes: one or two plain sentences for the team that
say exactly what you changed, and anything you skipped and why.` : ""}`;

const editorUser = (rev, change) => [
  `Episode: ${ctx.episode?.title ?? ""} (${ctx.episode?.show ?? ""}). Guest: ${ctx.episode?.guest ?? "none"}.`,
  `Reel #${ctx.piece?.num}: ${ctx.piece?.title ?? ""}`,
  ctx.piece?.hook ? `Planned hook: ${ctx.piece.hook}` : "",
  ctx.piece?.caption ? `Its written caption: ${ctx.piece.caption}` : "",
  rev ? `The approved edit (keep it; change only what's asked):\n${JSON.stringify(rev)}` : "",
  rev ? `The changes to make:\n${String(change).trim()}` : "",
  !rev && ctx.notes ? `The team's notes for this edit (follow them unless one breaks a brand rule, and say so in notes if you skip one):\n${ctx.notes}` : "",
  ctx.script?.length ? `The episode transcript for this clip (the reference for wording and numbers; its times are rough, clip seconds):\n${ctx.script.map((l) => `${l.at.toFixed(1)} ${l.who}: ${l.text}`).join("\n")}` : "",
  ctx.turns?.length ? `Who speaks when (clip seconds; top = the guest's half, bottom = ${O}'s): ${ctx.turns.map((x) => `${x.at.toFixed(1)} ${x.who} (${x.side})`).join(", ")}. Each graphic lands in the half of whoever is speaking when its first item is said.` : "",
  `The clip is ${DUR.toFixed(1)} seconds long. Word timings (word@start-end):`,
  words.map((w) => `${w.text}@${w.start.toFixed(2)}-${w.end.toFixed(2)}`).join(" "),
].filter(Boolean).join("\n\n");

async function ask(system, user, schema, withSchema) {
  const params = {
    model: MODEL,
    max_tokens: 64000,
    output_config: withSchema ? { effort: "medium", format: { type: "json_schema", schema } } : { effort: "medium" },
    betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...BRAIN,
    system,
    messages: [{ role: "user", content: user }],
  };
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
  const msg = await send(params);
  if (msg.stop_reason === "refusal") throw new Error("The model declined this edit.");
  const texts = msg.content.filter((b) => b.type === "text").map((b) => b.text);
  const raw = (texts[texts.length - 1] ?? "").match(/\{[\s\S]*\}/) ?? texts.join("\n").match(/\{[\s\S]*\}/);
  if (!raw) throw new Error("The editor didn't return a plan.");
  return { plan: JSON.parse(raw[0]), usage: msg.usage };
}
// structured output when it's accepted alongside the brain connection, plain JSON otherwise
async function run(system, user, schema = SCHEMA) {
  try { return await ask(system, user, schema, true); } catch (e) {
    if (!/format|schema|output_config/i.test(String(e))) throw e;
    return ask(system, user, schema, false);
  }
}

// The coach's first look: the same standard the finished reel is held to, on everything the plan decides.
const LOOK = obj({ fixes: { type: "array", items: obj({ where: str, problem: str, change: str }) }, notes: str });
const rules = Array.isArray(ctx.rules) && ctx.rules.length ? `\nRules ${O} added from their own reviews (they beat everything except the ${DOCS.guardrails}):\n${ctx.rules.map((r) => `- ${r}`).join("\n")}\n` : "";
const coachSystem = `You are ${C}, the review layer in ${st.brand}'s content studio. ${O}'s team makes the content; you
judge each piece the way ${O} would before it reaches them. This reel hasn't been rendered yet: you're reading its edit
plan, so whatever you catch now is fixed before anyone sees it (a filter it goes through first, so there are fewer
suggestions and fewer edits along the way).

Start by calling get_brand_brief. Then read your standard, "${DOCS.review}" (the seven checks in priority order, format
standards, verdicts), the "${DOCS.voice}" doc, the "${DOCS.guardrails}", "${DOCS.avoidAi}" and "${DOCS.reel}" (brain_search,
brain_get_document). The brain is the authority. ${brainRules(st)}
${rules}
Check the plan the way you'd check the finished reel, but only what the plan decides: which lines are kept and in what
order (the stop test on the opening; the host test: when ${O} makes their own point, it's kept), the opening bar's words,
the name card, each graphic and effect (its kind, title and words, whether it adds something new or repeats one, how
many there are), the end card, and the truth of every word and number on screen against the episode transcript. The
picture itself (faces, framing, what's on screen when) is checked after the render, so leave it out.
The editor has an effect library to use more: checklist (steps that tick off), screen (the app
they describe: split, phone or behind them), orbit (names circling the speaker), wall (moments of the episode behind
them), headlines (quotes pinned up behind them), chart (a real number growing), cover (a magazine masthead behind the
head), glass (one word in the room), paper (a collage with the speaker as a sticker), doodle (a boiling hand-drawn
outline), frame (the speaker breaking out of a social post), punches (a hard zoom on one word), transitions (a
zoom-blur through a join, or a straight cut to the next speaker alone), vertigo (the room falls away on a realization) and a pullback ending into the episode's
player. When a strong line sits on plain talking head and an effect would show it better than a box, say which effect,
on which line, with which words. When an effect only decorates (it shows nothing that's said), or two effects do the
same job, ask for the swap or the cut.
fixes: at most four, most important first, each one something the editor can change in the plan: where (the opening
bar, a graphic, a line, named by its words), problem (one plain sentence), change (exactly what to do, using only words
the speakers said). An empty list when the plan passes. Never invent words, numbers or opinions for ${O}. notes: one
plain sentence for the team on what you asked for, or that it passed. Answer with the JSON only.`;
const q = (s) => `"${s ?? ""}"`;
const describe = (g) => {
  const t = g.title ? ` ${q(g.title)}` : "";
  if (g.kind === "stat") return `Number box${t}: ${q(g.value)}, ${q(g.label || g.text)}`;
  if (g.kind === "message") return `Message mockup${t}${g.label ? ` (${g.label})` : ""}: ${q((g.lines ?? [g.text]).join(" "))}`;
  if (g.kind === "compare") return `Bar comparison${t}: ${(g.bars ?? []).map((b) => `${q(b.label)} (${b.value})`).join(" vs ")}`;
  if (g.kind === "tag") return `Hanging tag: ${q(g.text || g.title)}`;
  if (g.kind === "clones") return `Clone wall (the speaker repeated 3 by 3), label ${q(g.title || g.text)}`;
  const rows = (g.rows ?? []).map((r) => q(r.text)).join(", ");
  if (g.kind === "checklist") return `Checklist${t}: ${rows}`;
  if (g.kind === "screen") return `${g.app || "email"} on screen (${g.device || "box"})${g.label ? ` from ${g.label}` : ""}${t}: ${q((g.lines ?? [g.text]).join(" "))}${g.value ? `, button ${q(g.value)}` : ""}`;
  if (g.kind === "orbit") return `Orbit around the speaker: ${rows}`;
  if (g.kind === "wall") return `Wall of episode moments behind the speaker${t}`;
  if (g.kind === "headlines") return `Headlines pinned behind the speaker: ${rows}`;
  if (g.kind === "chart") return `Line chart${t}: ${(g.bars ?? []).map((b) => `${q(b.label)} (${b.value})`).join(" to ")}`;
  if (g.kind === "cover") return `Magazine cover: masthead ${q(g.title)}, cover lines ${(g.lines ?? []).map(q).join(", ")}${g.label ? `, issue ${q(g.label)}` : ""}`;
  if (g.kind === "glass") return `Glass word in the room: ${q(g.title)}`;
  if (g.kind === "paper") return `Paper collage${t}${g.value ? `, counter ${q(g.value)}` : ""}`;
  if (g.kind === "doodle") return `Doodle outline${t}`;
  if (g.kind === "frame") return `Social post frame (${q(g.label)}): ${q(g.text)}`;
  return `Box${t}: ${rows || "no rows"}`;
};
// the plan comes back before it's straightened, so one move can be an object instead of a list (a single vertigo
// object once made the coach's first look fail)
const many = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []).filter((x) => x && typeof x === "object");
const moves = (p) => [
  ...many(p.punches).map((x) => `\n- At ${x.at} s: a punch-in until ${x.until} s`),
  ...many(p.transitions).map((x) => `\n- At ${x.at} s: ${x.kind === "straight" ? "a straight cut to the next speaker alone" : "a zoom-blur through the join"}`),
  ...many(p.vertigo).map((x) => `\n- At ${x.at} s: vertigo until ${x.until} s`),
  p.ending === "pullback" ? "\n- The ending pulls back into the episode's player" : "",
].join("");
const lookUser = (p) => [
  `Episode: ${ctx.episode?.title ?? ""} (${ctx.episode?.show ?? ""}). Guest: ${ctx.episode?.guest ?? "none"}.`,
  `Reel #${ctx.piece?.num}: ${ctx.piece?.title ?? ""}`,
  ctx.piece?.hook ? `The idea's planned hook (the team's working line, not on screen): ${ctx.piece.hook}` : "",
  `The edit plan, in clip seconds:\nKept, in order:\n${many(p.segments).map((s) => `- ${Number(s.in).toFixed(1)} to ${Number(s.out).toFixed(1)}: ${s.text}`).join("\n")}`,
  `On screen:\n- ${p.hook?.text ? `Opening bar until ${p.hook.until} s: ${q(p.hook.text)}` : "No opening bar."}`
    + (p.name?.name ? `\n- Name card at ${p.name.at} s: ${q(p.name.name)}, ${q(p.name.line)}` : "")
    + many(p.graphics ?? p.cards).map((g) => `\n- At ${g.at} s: ${describe(g)}`).join("") + moves(p)
    + (p.end ? `\n- End card: ${q(p.end.name)}, ${q(p.end.line)}, button ${q(p.end.cta)}, ${q(p.end.url)}` : ""),
  ctx.turns?.length ? `Who speaks when (clip seconds): ${ctx.turns.map((x) => `${x.at.toFixed(1)} ${x.who}`).join(", ")}.` : "",
  ctx.script?.length ? `The episode transcript for this clip (the truth test uses only this; clip seconds, rough):\n${ctx.script.map((l) => `${l.at.toFixed(1)} ${l.who}: ${l.text}`).join("\n")}` : "",
].filter(Boolean).join("\n\n");

let out = await run(editorSystem(prev), editorUser(prev, ctx.change));
let plan = out.plan;
if (!prev && ctx.coach !== false) {
  try {
    const look = (await run(coachSystem, lookUser(plan), LOOK)).plan;
    const fixes = (look.fixes ?? []).filter((f) => f?.change).slice(0, 4);
    console.log(`coach first look: ${fixes.length ? `${fixes.length} fix(es): ${fixes.map((f) => f.where).join("; ")}` : "passed"}`);
    if (fixes.length) {
      const change = [`These come from ${C} reading this plan before the render; any times in them are clip seconds.`, ...fixes.map((f) => `${C}: ${f.where}: ${f.problem} Change: ${f.change}`)].join("\n");
      const first = plan;
      out = await run(editorSystem(first), editorUser(first, change));
      plan = out.plan;
      plan.notes = [first.notes, `${C} read the plan before the render and asked for ${fixes.length} change${fixes.length > 1 ? "s" : ""}: ${plan.notes ?? ""}`].filter(Boolean).join(" ");
    }
    plan.precheck = { fixes, notes: String(look.notes ?? "") };
  } catch (e) {
    // the first look is a filter, not a gate: the edit goes on without it
    console.log(`coach first look skipped: ${String(e).slice(0, 160)}`);
  }
}

// Keep the plan inside the clip and in order; a cut that makes no sense falls back to the whole clip.
const clamp = (t) => Math.max(0, Math.min(DUR, Number(t) || 0));
let segs = (plan.segments ?? []).map((s) => ({ in: clamp(s.in), out: clamp(s.out), text: String(s.text ?? "") })).filter((s) => s.out - s.in >= 0.3).sort((a, b) => a.in - b.in);
segs = segs.reduce((acc, s) => { const last = acc[acc.length - 1]; if (last && s.in < last.out) last.out = Math.max(last.out, s.out); else acc.push(s); return acc; }, []);
const kept = segs.reduce((a, s) => a + s.out - s.in, 0);
if (!segs.length || kept < 6) segs = [{ in: 0, out: DUR, text: "the whole clip" }];
plan.segments = segs.map((s, i) => ({ id: `s${i + 1}`, ...s }));
plan.layout = ctx.layout;
plan.turns = ctx.turns ?? [];
// where the clip starts in the episode, so the next revision can line this plan up with a longer or shorter clip
if (Number.isFinite(Number(ctx.start))) plan.clip_start = Number(ctx.start);
if (prev) plan.revision = String(ctx.change).trim();
// a plain-JSON answer (when the schema can't ride with the brain connection) can bend a shape, like one move as an object
// instead of a list; straighten it here so the builder never trips on it
const list = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []).filter((x) => x && typeof x === "object");
for (const k of ["emphasis", "punches", "transitions", "vertigo", "fixes"]) plan[k] = list(plan[k]);
plan.transitions = plan.transitions.map((x) => ({ ...x, kind: x.kind === "straight" ? "straight" : "zoom" }));
plan.keys = Array.isArray(plan.keys) ? plan.keys.filter((k) => typeof k === "string") : [];
plan.ending = plan.ending === "pullback" ? "pullback" : "card";
plan.graphics = list(plan.graphics ?? plan.cards).slice(0, 5);
delete plan.cards;
fs.writeFileSync("plan.json", JSON.stringify(plan, null, 1));
fs.writeFileSync("cutlist.json", JSON.stringify({ source: "assets/source.mp4", fps: 30, segments: plan.segments }, null, 1));
console.log(`${prev ? "revised " : ""}edit plan: ${plan.segments.length} segment(s), ${kept.toFixed(1)} s kept, ${plan.graphics.length} graphic(s) (${plan.graphics.map((g) => g.kind).join(", ")}), ${(plan.emphasis ?? []).length} push(es), ${(plan.punches ?? []).length} punch(es), ${plan.transitions.filter((x) => x.kind === "zoom").length} zoom-through(s), ${plan.transitions.filter((x) => x.kind === "straight").length} straight cut(s)${(plan.vertigo ?? []).length ? ", vertigo" : ""}, ending ${plan.ending || "card"}; ${out.usage.input_tokens} in / ${out.usage.output_tokens} out tokens`);
if (plan.notes) console.log(`editor's note: ${plan.notes}`);
