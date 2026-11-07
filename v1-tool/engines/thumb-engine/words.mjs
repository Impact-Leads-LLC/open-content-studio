// Thumbnail words (thumb engine, thumbnail-builder 3.1 and hook-maker 1.5). Claude finds the episode's biggest
// takeaway (the best advice in it, never a side tactic), says it in one line, and writes three thumbnail options from
// it. Each option carries the words for every look it suits: the call (support on the tag, hero with one accent loop,
// and guest_at, the guest's line the call window shows), the number wall (a number hero, a support word, an optional
// sticker) and the board (a hero, an optional support line, an optional tag). It also writes a shorter line when the
// renderer's copy-fit sends one back (the type is never scaled).
//   node words.mjs options              <job>/context.json -> <job>/work/words.json {takeaway, options, notes, dropped}
//   node words.mjs shorter <over.json>  -> <job>/work/shorter.json {support, hero, sticker, why}
// Needs ANTHROPIC_API_KEY, BRAIN_MCP_URL and BRAIN_MCP_TOKEN (the studio's brain); CLAUDE_MODEL is optional. Names come
// from context.json studio. Tests: WORDS_FILE or SHORTER_FILE stands in for Claude's answer.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS, MODEL, NO_BRAIN, brain, brainRules, studioOf } from "./studio.mjs";

const E = path.dirname(fileURLToPath(import.meta.url));
const J = process.env.JOB_DIR ?? "/tmp/job";
const W = path.join(J, "work");
const ctx = JSON.parse(fs.readFileSync(path.join(J, "context.json"), "utf8"));
const st = studioOf(ctx);
const mode = process.argv[2];
const skill = (name, p) => `<skill name="${name}">\n${fs.readFileSync(path.join(E, p), "utf8")}\n</skill>`;
const SKILLS = [
  skill("hook-maker", "hook-maker/SKILL.md"),
  skill("thumbnail-builder", "skill/SKILL.md"),
  skill("thumbnail-builder/references/art-direction.md", "skill/references/art-direction.md"),
  skill("thumbnail-builder/references/design.md", "skill/references/design.md"),
].join("\n\n");

const LOOKS = ["call", "wall", "board"];
const TYPES = ["skeptic", "verdict", "warning", "number", "secret", "smirk", "how"];
// the hook types one of the owner's photos plays today (the app asks thumb_pick)
const playable = (Array.isArray(ctx.playable) && ctx.playable.length ? ctx.playable : TYPES).filter((t) => TYPES.includes(t));
// the guest with a camera track on file (the app reads it from the episode's feeds); none means no call
const guest = String(ctx.guest ?? "").trim();
const title = String(ctx.title || ctx.episode?.title || "").trim();
const transcript = String(ctx.transcript ?? "").slice(0, 150000);

const str = { type: "string" }, num = { type: "number" };
const obj = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const LOOK = obj({
  look: { type: "string", enum: LOOKS },
  support: str, hero: str, sticker: str,
  order: { type: "string", enum: ["support-first", "hero-first"] },
  mark: { type: "string", enum: ["loop", "none"] },
  hook_type: { type: "string", enum: playable },
});
const OPTION = obj({
  looks: { type: "array", items: LOOK },
  guest_at: num, guest_line: str,
  mechanism: str, why: str, title_fit: str, source_line: str, payoff_line: str,
  flags: { type: "array", items: str },
});
const SCHEMA = {
  options: obj({ takeaway: str, takeaway_line: str, options: { type: "array", items: OPTION }, recommended: { type: "integer" }, notes: str }),
  shorter: obj({ support: str, hero: str, sticker: str, why: str }),
};

const BRAIN = `Use the studio's brain tools (get_brand_brief, brain_search, brain_get_document); where a skill says to run SQL
or to search the brain, use these tools instead. Start with get_brand_brief (it returns the "${DOCS.brief}"), then read
the brain docs "${DOCS.thumbs}", "${DOCS.voice}", "${DOCS.guardrails}" and "${DOCS.avoidAi}" with brain_get_document,
and hold the words to "${DOCS.review}" (${st.coach}'s checks) before you answer. The brain wins over the skills, and
"${DOCS.thumbs}" wins over thumbnail-builder. An idea from a guest belongs to the guest: never put a guest's claim in
${st.owner}'s mouth.
${brainRules(st)}`;

const RULES = `The thumbnail fields (hook-maker 1.5, Step 5, thumbnail-builder 3.0). One entry per look the words suit:
- call${guest ? "" : " (not on this episode: there is no guest, so never write a call)"}: support = the problem the
  guest's frame shows, on an ink tag (one or two words, about 9 letters); hero = the fix, one word of 5 letters or
  fewer; mark = loop; sticker = "". The option's guest_at is
  then the exact second (the transcript's clock, the numbers in brackets) when ${guest || "the guest"} says the problem
  line the frame should show, and guest_line is that line word for word.
- wall: hero = a number of 1 to 5 characters (0-9, %, +, X) worth seeing big; support = one or two words in front of it
  (about 7 letters); sticker = the payoff in two words at most, or ""; mark = none. A round figure from the speaker is
  flagged rounded-figure.
- board: hero = a number or one short word; support = a line on the board, or ""; sticker = the payoff on an accent
  tag in two words at most, or ""; mark = none.
All caps. Support two words at most, hero one word, sticker two words at most, five words in all. Punctuation: an
apostrophe, a question mark (allowed question hooks only), % and a hyphen, nothing else: no commas, no em or en dashes,
no $ (write the figure another way). No contrast lines. order: support-first, or hero-first when a number leads.
hook_type per look, from the expression the words need: one of ${playable.join(", ")} (the only types one of
${st.owner}'s own photos plays today). One hot colour, the brand's accent: the call's loop, the wall's sticker, the
board's tag (the board itself is the brand's primary colour: the accent is never a background).`;

const SYSTEM = {
  options: `You write the words on the YouTube thumbnail of one of ${st.ownerFull}'s produced full episodes${st.show ? ` of ${st.show}` : ""},
in the content studio of ${st.brand}. Nobody answers questions in this run: the audience is ${st.audience}, the destination
is a long-form YouTube video, and the title below is the video's title.
Follow the hook-maker skill below whole and in order for that destination, slot 10 included: first find the episode's
biggest takeaway, the best advice in it, the thing the host spent the most words teaching, the one a viewer would come
away using. Never a side tactic or a fun aside, however good its number is. Say it in one plain line (takeaway) and quote
where it's taught (takeaway_line, with its times). Then extract, write five hooks with five mechanisms, the thumbnail
fields for each from the takeaway only, and run the full delivery gate (humanizer loop, guardrail sweep, voice test,
truth check, first-line test, and the cover test on the thumbnail words read beside the title). ${BRAIN}
Then answer with the thumbnail fields of the three strongest options, the one you'd run first as the first. Every option
says the takeaway; the options differ in angle. Each option carries the words for every look they suit (the app rotates
the looks and shows ${st.owner} each one, so give each option as many of the three looks as its words really play, the same
words where they fit two looks). ${RULES}
The thumbnail adds to the title and never repeats a content word from it: the title says what the video covers, the
thumbnail adds the charge (the stake, the warning, the result, the regret, the contradiction). The words promise only what
the episode pays off, and every figure is one said in the episode.
For each option: mechanism (hook-maker's label), why (one plain sentence for ${st.owner} on why this one), title_fit (one plain
line on what it adds to the title), source_line and payoff_line (the transcript sentences it traces to and that pay it
off, word for word, with their times), flags (hook-maker's flags), guest_at and guest_line (for a call; else -1 and "").
No em dashes anywhere. recommended: 1. notes: anything ${st.owner} should know, else empty. Return only the JSON.

${SKILLS}`,
  shorter: `The thumbnail renderer in ${st.brand}'s content studio measured an element of the thumbnail words wider than its
limit. The type is never scaled, squeezed or re-tracked, so the words come back to you (hook-maker, Step 5: rewrite that
element from its source shorter by at least letters_to_cut letters and run the delivery gate on the new words). Keep the
takeaway, the look, the hook type and the order; change only what has to get shorter. ${BRAIN} ${RULES}
Return only the JSON: support, hero and sticker (the full new words of that look, the elements that fit as they were, ""
for none) and why (one plain line on what changed, no em dashes).

${SKILLS}`,
};

const head = [
  `Video title: ${title || "(none yet)"}`,
  ctx.working_title && ctx.working_title !== title ? `Working title in the studio: ${ctx.working_title}` : "",
  `Show: ${ctx.episode?.show ?? ""}. ${guest ? `Guest: ${guest} (their camera is on file, so the call can play).` : "No guest on this episode: the call can't play."}`,
].filter(Boolean).join("\n");

function userFor(over) {
  if (mode === "options") {
    return [head, ctx.chapters ? `Chapters:\n${ctx.chapters}` : "",
      ctx.notes ? `The team's notes (follow them unless one breaks a brand rule, and say so in notes):\n${ctx.notes}` : "",
      `Transcript (times in brackets are seconds on the recording's clock, as m:ss):\n${transcript}`].filter(Boolean).join("\n\n");
  }
  const w = over.words ?? {};
  return [head,
    over.takeaway ? `The takeaway: ${over.takeaway}` : "",
    `The look: ${w.look}. The words: support "${w.support ?? ""}", hero "${w.hero}", sticker "${w.sticker ?? ""}" (order ${w.order}, hook type ${w.hook_type})`,
    `Too wide:\n${(over.over ?? []).map((x) => `- the ${x.element} "${x.text}": ${x.measured_px} px of ink, the limit is ${x.limit_px} px, ${x.overflow_px} px over: cut at least ${x.letters_to_cut} letters`).join("\n")}`,
    over.source_line ? `It traces to: "${over.source_line}"` : "",
    `Transcript:\n${transcript}`].filter(Boolean).join("\n\n");
}

const BRAIN_CFG = brain();
const scrub = (s) => {
  let t = String(s).replace(/sk-ant-[A-Za-z0-9_-]+/g, "[key]").replace(/(token|sig|signature)=[^&\s"]+/gi, "$1=[...]");
  const tok = String(process.env.BRAIN_MCP_TOKEN ?? "").trim();
  if (tok.length >= 6) t = t.split(tok).join("[token]");
  return t.slice(0, 300);
};

async function ask(user, withSchema) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const params = {
    model: MODEL,
    max_tokens: 64000,
    output_config: withSchema ? { effort: "medium", format: { type: "json_schema", schema: SCHEMA[mode] } } : { effort: "medium" },
    betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
    fallbacks: "default",
    mcp_servers: BRAIN_CFG.mcp_servers,
    tools: BRAIN_CFG.tools,
    system: SYSTEM[mode],
    messages: [{ role: "user", content: user }],
  };
  // The brain lookups run on Anthropic's side, and a long run of them pauses the turn (pause_turn): sending it back
  // carries on. A cut-off answer says so instead of coming back as no answer at all.
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
  if (msg.stop_reason === "refusal") throw new Error("The model declined.");
  const texts = msg.content.filter((b) => b.type === "text").map((b) => b.text);
  const m = (texts[texts.length - 1] ?? "").match(/\{[\s\S]*\}/) ?? texts.join("\n").match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Claude didn't return the words.");
  return JSON.parse(m[0]);
}

// The brain server sometimes drops while Claude lists its tools: nothing is written yet, so ask again.
async function answer(user, testFile) {
  if (testFile) return JSON.parse(fs.readFileSync(testFile, "utf8"));
  if (!process.env.ANTHROPIC_API_KEY || !BRAIN_CFG) throw new Error(`${NO_BRAIN} on this machine`);
  for (let i = 0; ; i++) {
    try {
      try { return await ask(user, true); } catch (e) {
        if (!/format|schema|output_config/i.test(String(e))) throw e;
        return await ask(user, false);
      }
    } catch (e) {
      if (i >= 2 || !/MCP server returned an error|Connection closed|overloaded|529/i.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, i ? 10000 : 3000));
    }
  }
}

// ---- the fields each look can set, checked the way thumbnail-builder 3.0 checks words (G2) ----
const CHARS = /^[A-Z0-9 '?%+-]*$/;
const STOP = new Set("with from that this your what when they them their about into over have been were will just than then like".split(" "));
const titleWords = new Set(title.toUpperCase().replace(/[^A-Z0-9' ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase())));
const caps = (v) => String(v ?? "").toUpperCase().replace(/\s+/g, " ").trim();
const words = (v) => (v ? v.split(" ").length : 0);
const isNumber = (s) => { const t = s.replace(/ /g, ""); return t.length >= 1 && t.length <= 5 && /\d/.test(t) && /^[0-9%+X]+$/.test(t); };

// One look's words: {look, support, hero, sticker, order, mark, hook_type} or a list of problems.
function lookWords(l, look, hasGuestAt) {
  const support = caps(l.support), hero = caps(l.hero);
  let sticker = caps(l.sticker);
  const problems = [], flags = [];
  if (!hero) problems.push("no hero");
  if (/\s/.test(hero)) problems.push(`the hero "${hero}" is more than one word`);
  for (const [k, v] of [["support", support], ["hero", hero], ["sticker", sticker]]) {
    if (v && !CHARS.test(v)) problems.push(`the ${k} "${v}" has a comma, a dash or punctuation a thumbnail can't carry`);
  }
  if (words(support) > 2) problems.push(`the support "${support}" is more than two words`);
  if (words(sticker) > 2) problems.push(`the sticker "${sticker}" is more than two words`);
  if (words(support) + words(hero) + words(sticker) > 5) problems.push("more than five words in all");
  const hook_type = playable.includes(l.hook_type) ? l.hook_type : null;
  if (!hook_type) problems.push(`hook type "${l.hook_type}" has no photo of ${st.owner} that plays it`);
  if (look === "call") {
    if (!guest) problems.push("no guest on this episode");
    if (!hasGuestAt) problems.push("no guest moment (guest_at) for the call window");
    if (!support) problems.push("the call needs a support line for the tag");
    if (sticker) { sticker = ""; flags.push("call-no-sticker"); }
  }
  if (look === "wall") {
    if (!isNumber(hero)) problems.push(`the wall needs a number of 1 to 5 characters as the hero ("${hero}" is not one)`);
    if (!support) problems.push("the wall needs a support word in front of the number");
  }
  const repeats = `${support} ${hero} ${sticker}`.split(" ").filter((w) => w && titleWords.has(w));
  if (repeats.length) flags.push(`repeats-title: ${repeats.join(" ")}`);
  return {
    look, support: support || null, hero, sticker: sticker || null,
    order: l.order === "hero-first" ? "hero-first" : "support-first",
    mark: look === "call" && l.mark !== "none" ? { kind: "loop", target: "hero" } : null,
    hook_type, flags, problems,
  };
}

const s = (v, max = 400) => String(v ?? "").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, max);
const shown = (w) => [w.order === "hero-first" ? w.hero : w.support, w.order === "hero-first" ? w.support : w.hero, w.sticker].filter(Boolean).join(" / ");

function option(o, dropped) {
  const at = Number(o.guest_at);
  const hasAt = Number.isFinite(at) && at >= 0;
  const seen = new Set(), looks = [];
  for (const l of Array.isArray(o.looks) ? o.looks : []) {
    const look = LOOKS.includes(l?.look) ? l.look : null;
    if (!look || seen.has(look)) continue;
    seen.add(look);
    const w = lookWords(l, look, hasAt);
    if (w.problems.length) dropped.push(`${look} ${shown(w)}: ${w.problems.join("; ")}`);
    else looks.push({ ...w, problems: undefined });
  }
  looks.sort((a, b) => LOOKS.indexOf(a.look) - LOOKS.indexOf(b.look));
  return {
    looks, guest_at: hasAt && looks.some((l) => l.look === "call") ? Math.round(at * 10) / 10 : null, guest_line: s(o.guest_line, 400),
    mechanism: s(o.mechanism, 80), why: s(o.why), title_fit: s(o.title_fit), source_line: s(o.source_line, 600), payoff_line: s(o.payoff_line, 600),
    flags: [...new Set([...(Array.isArray(o.flags) ? o.flags : []).map(String).filter(Boolean), ...looks.flatMap((l) => l.flags)])],
  };
}

const say = (t) => console.log(t);

try {
  if (mode === "options") {
    const a = await answer(userFor(), process.env.WORDS_FILE);
    const takeaway = s(a.takeaway, 300);
    if (!takeaway) throw new Error("no biggest takeaway came back");
    const dropped = [];
    const list = (Array.isArray(a.options) ? a.options : []).map((o) => option(o, dropped));
    const rec = Math.min(Math.max(Number(a.recommended) || 1, 1), list.length || 1) - 1;
    if (rec > 0) list.unshift(...list.splice(rec, 1));
    const ok = list.filter((o) => o.looks.length).slice(0, 3).map((o, i) => ({ n: i + 1, ...o, looks: o.looks.map(({ flags, ...l }) => l) }));
    if (!ok.length) throw new Error(`none of the words can go on a thumbnail (${dropped.join(" | ") || "no options came back"})`);
    const notes = s(a.notes, 1200);
    fs.writeFileSync(path.join(W, "words.json"), JSON.stringify({ title, takeaway, takeaway_line: s(a.takeaway_line, 800), options: ok, notes, dropped }, null, 1));
    say(`takeaway: ${takeaway}`);
    say(`words: ${ok.map((o) => `${o.n}. ${o.looks.map((l) => `${l.look} ${shown(l)}`).join(", ")}`).join(" | ")}`);
    if (dropped.length) say(`left out: ${dropped.join(" | ")}`);
  } else if (mode === "shorter") {
    const over = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    const a = await answer(userFor(over), process.env.SHORTER_FILE);
    const w = over.words ?? {};
    const got = lookWords({ ...w, support: a.support, hero: a.hero, sticker: a.sticker, mark: w.mark ? "loop" : "none" }, w.look, w.look !== "call" || over.guest_at != null);
    if (got.problems.length) throw new Error(`the shorter words can't go on a thumbnail: ${got.problems.join("; ")}`);
    fs.writeFileSync(path.join(W, "shorter.json"), JSON.stringify({ support: got.support, hero: got.hero, sticker: got.sticker, why: s(a.why, 300) }, null, 1));
  } else {
    throw new Error("usage: node words.mjs options | shorter <over.json>");
  }
} catch (e) {
  console.error(scrub(e?.message ?? e));
  process.exit(1);
}
