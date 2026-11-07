// The animated reel's plan (animated engine): Claude turns one piece's words (the hook, the outline, the stretch of the
// idea it comes from) into a beat script for a reel with no camera footage: 6 to 12 beats, 20 to 45 seconds at reading
// pace, each beat one layout from the library build.py draws (big statement, number count-up, list that builds,
// before/after, quote sticker, a card that builds in, kinetic sticker pop). The look is fixed in build.py; this decides
// the words and the order. Writes work/plan.json.
// A change (context.previous + context.change) starts from the beats the team liked and changes only what they asked.
// Needs ANTHROPIC_API_KEY, BRAIN_MCP_URL and BRAIN_MCP_TOKEN (optional CLAUDE_MODEL); without them (or if the call
// fails) a plain plan comes out from the piece's own hook and words, so the reel still renders. PLAN_FILE=<json> uses
// a plan made elsewhere (tests).
import fs from "node:fs";
import { brain, brainRules, DOCS, MODEL, NO_BRAIN, studioOf } from "./studio.mjs";

const ctx = fs.existsSync("context.json") ? JSON.parse(fs.readFileSync("context.json", "utf8")) : {};
const st = studioOf(ctx);
const piece = ctx.piece ?? {};
const script = Array.isArray(ctx.script) ? ctx.script : [];
const LAYOUTS = ["statement", "number", "list", "before_after", "quote", "card", "kinetic"];
// the owner's voiceover: their words with their times (run.sh), cut into phrases at their pauses and sentence ends
const voWords = (() => { try { const j = JSON.parse(fs.readFileSync("work/vo-words.json", "utf8")); return (Array.isArray(j) ? j : j.words ?? []).filter((w) => String(w.text ?? "").trim()); } catch { return []; } })();
const VO = !!ctx.vo && voWords.length > 0;
const phrases = [];
for (const w of VO ? voWords : []) {
  const t = String(w.text).trim();
  const p = phrases[phrases.length - 1];
  if (p && w.start - p.end < 0.28 && p.n < 11 && !/[.?!]$/.test(p.text) && !(/,$/.test(p.text) && p.n >= 4)) { p.text += ` ${t}`; p.end = w.end; p.n += 1; }
  else phrases.push({ start: w.start, end: w.end, text: t, n: 1 });
}
// the end card's fallback when the plan leaves it empty: the studio's booking page, else its website, else its handle
// (the real wording comes from the brain doc "Reel Edits", its end card section)
const bare = (u) => String(u ?? "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
const END_DEFAULT = st.bookingUrl ? { line: "", cta: "Book a call", url: bare(st.bookingUrl) }
  : st.website ? { line: "", cta: "", url: bare(st.website) }
  : { line: "", cta: st.handle ? `Follow ${st.handle}` : "", url: "" };

const str = { type: "string" };
const obj = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const SCHEMA = obj({
  beats: { type: "array", items: obj({
    layout: { type: "string", enum: LAYOUTS },
    text: str, key: str, value: str, label: str, title: str,
    rows: { type: "array", items: str },
    before: str, after: str, line: str,
    from: { type: "number" }, to: { type: "number" },
  }) },
  end: obj({ line: str, cta: str, url: str }),
  notes: str,
});

const prev = ctx.previous && typeof ctx.previous === "object" && Array.isArray(ctx.previous.beats) && String(ctx.change ?? "").trim() ? ctx.previous : null;

const system = `You are the animated reel editor in ${st.brand}'s content studio. You plan one 9:16 reel with no camera
footage: animated type and brand graphics, made from the words of one idea by ${st.ownerFull}, for ${st.audience}. A
fixed builder draws the look; you decide the beats, their layouts and their words.

Start by calling get_brand_brief, then read the brain docs "${DOCS.reel}", "${DOCS.voice}", "${DOCS.guardrails}" and
"${DOCS.avoidAi}" (brain_search, brain_get_document). The brain wins over anything here.
${brainRules(st)}

The look: mostly The Board (a board in the brand's primary colour with big white Libre Franklin Black caps, white cards
with hard ink shadows, ink chips) with a splash of Kinetic Layers (content hovering on a dark panel: tilted stickers, a
big outlined number, a highlighter on the key word, flying in and out). The accent colour is an accent only (numbers,
the highlighter, the booking button), never a background. Never one format every time.

The reel: ${VO ? `${st.owner}'s recorded voice carries it, with sound effects under it` : "no voice. The words carry it, at reading pace, with sound effects under them"}. It opens on its cover for half
a second, then the beats play, then an end card. Plan 6 to 12 beats that run 20 to 45 seconds read at a comfortable
pace (the builder times each beat by its word count: about 3 words a second plus a beat to land). Fewer words per beat
is better: a phone screen, read in a glance.

Each beat is one layout:
- statement: one big line in huge caps. text = the line (3 to 9 words, under 60 characters); key = one or two words of
  it that get the ink chip (the word the line turns on).
- number: a number counts up. value = the number exactly as it appears in the source ("30+", "95%", "15,000", "$45,000");
  label = what it counts (under 50 characters); title = an optional chip above (1 to 3 words).
- list: a card where rows build one at a time. title = 1 to 3 words; rows = 2 to 5 short rows (under 30 characters each).
- before_after: two cards, the old way and the new way. before and after = under 55 characters each; title and label
  = the two chip words (default "Before" and "After").
- quote: a sticker with a line said in the source, word for word, under 20 words. text = the quote; label = who said it.
- card: a white card builds in with one line on it. text = the line on the card (under 50 characters); key = the word
  that gets the ink chip; title = an optional chip. At most one in a reel.
- kinetic: the Kinetic Layers beat. text = one big line (2 to 7 words); key = the word that gets the highlighter;
  value = an optional big outlined number or one word (under 10 characters); rows = 0 to 2 extra stickers (under 26
  characters each). About one beat in four, never two in a row.
Every beat may also have line: one caption sentence under the graphic (under 14 words), for the thought the graphic
doesn't say on its own. Leave it empty on statement and kinetic beats, and on any beat that reads fine without it.

Rules:
- The first beat is the hook: the piece's hook or the strongest line of the source, as a statement or kinetic beat.
- The order tells one idea: hook, the problem or the setup, the turn, the how or the proof, the point landing. End on
  the point, not a summary.
- Never two beats in a row with the same layout. Mix layouts; use a number, a list or a before/after where the source
  gives you one.
- Every word on screen comes from the source (the piece's words below) or the brand brief. Never invent a figure, a
  client, a quote, a result or a claim. Numbers keep what the source attached to them ("a month", "or more"); an
  example stays an example. Keep ${st.owner}'s words where they fit; shorten, never embellish.
- Ideas from a guest belong to the guest: credit them by name.
- The Voice Guardrails: no em dashes, no hype, no manufactured sales lines, plain words a 10-year-old reads.
- end: the end card. line = what the call to action gets the viewer, in their words; cta = the call to action; url =
  where it goes. Take them from the end card section of "${DOCS.reel}" or the brand brief${st.bookingUrl ? ` (the booking page is ${st.bookingUrl})` : st.website ? ` (the website is ${st.website})` : ""}; leave them
  empty to use the studio's defaults.
- notes: two or three plain sentences for the team on what you built and why.
${VO ? `
${st.owner} recorded the voiceover, so this reel follows the voice, not reading pace. The words are below as numbered
phrases with their times. Group consecutive phrases into 6 to 12 beats that follow what is said: each beat has from and
to (the first and last phrase numbers it covers, inclusive), the beats cover every phrase in order with no gaps, and a
beat runs about 2 to 7 seconds of the voice. The words on screen in a beat come from what is said in it (shortened,
never a new claim); a number beat covers the phrase where the number is said, a list's rows are things said in that
beat, a before_after's two sides are both said in it. Leave line empty on every beat: live captions of the voice run
under all of them. The first beat is the spoken hook, as a statement or kinetic beat.` : `Leave from and to at 0.`}
Return only the JSON.`;

const pieceText = [
  `Piece #${piece.num ?? ""}: ${piece.title ?? ""}`,
  piece.hook ? `Hook (the team's working line; the cover uses it): ${piece.hook}` : "",
  piece.angle ? `Angle: ${piece.angle}` : "",
  piece.insight ? `Core insight: ${piece.insight}` : "",
  ctx.stage ? ctx.stage : "",
  piece.why ? `Why it's on the board: ${piece.why}` : "",
  piece.outline ? `Outline:\n${piece.outline}` : "",
  piece.editor_notes ? `Design notes from the Moment Coach:\n${piece.editor_notes}` : "",
  piece.cta ? `Call to action keyword: ${piece.cta}` : "",
  piece.caption ? `The caption that goes out with it (written from the same source; it may hold facts from the brand brief):\n${piece.caption}` : "",
].filter(Boolean).join("\n\n");

const user = [
  `${ctx.episode?.kind === "idea" ? `A standalone idea ${st.owner} recorded on their own` : `From "${ctx.episode?.title ?? ""}" (${ctx.episode?.show ?? ""})`}.`,
  pieceText,
  `The source: ${ctx.episode?.kind === "idea" ? "the idea" : "the transcript"} around the piece. Lines marked * are the piece's own stretch; the rest is context.\n${script.map((l) => `${l.in ? "*" : " "} ${l.who ? `${l.who}: ` : ""}${l.text}`).join("\n")}`,
  ctx.notes ? `The team's notes for this reel (follow them unless one breaks a brand rule, and say so in notes if you skip one):\n${ctx.notes}` : "",
  Array.isArray(ctx.rules) && ctx.rules.length ? `Rules ${st.owner} added from past reviews (they beat everything except the Voice Guardrails):\n${ctx.rules.map((r) => `- ${r}`).join("\n")}` : "",
  VO ? `The voiceover, phrase by phrase (number, start in seconds, words):\n${phrases.map((p, i) => `[${i}] ${p.start.toFixed(1)} s: ${p.text}`).join("\n")}` : "",
  prev && !VO ? `The team likes this reel. Return the same beats with only these changes made; keep every other beat exactly as it is, and say in notes what you changed and anything you skipped and why.\nThe reel they liked:\n${JSON.stringify({ beats: prev.beats, end: prev.end })}\nThe changes to make:\n${String(ctx.change).trim()}` : "",
].filter(Boolean).join("\n\n");

const B = brain();

async function ask(withSchema) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const params = {
    model: MODEL,
    max_tokens: 64000,
    output_config: withSchema ? { effort: "medium", format: { type: "json_schema", schema: SCHEMA } } : { effort: "medium" },
    betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
    fallbacks: "default",
    mcp_servers: B.mcp_servers,
    tools: B.tools,
    system,
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
  if (msg.stop_reason === "refusal") throw new Error("The model declined this plan.");
  const texts = msg.content.filter((b) => b.type === "text").map((b) => b.text);
  const m = (texts[texts.length - 1] ?? "").match(/\{[\s\S]*\}/) ?? texts.join("\n").match(/\{[\s\S]*\}/);
  if (!m) throw new Error("The editor didn't return a plan.");
  return { plan: JSON.parse(m[0]), usage: msg.usage };
}

const clean = (v) => String(v ?? "").replace(/sk-ant-[A-Za-z0-9_-]+/g, "[key]").replace(/(token|sig|signature)=[^&\s]+/gi, "$1=[...]");
let plan = {}, usage = null, why = "";
if (process.env.PLAN_FILE) plan = JSON.parse(fs.readFileSync(process.env.PLAN_FILE, "utf8"));
else if (!process.env.ANTHROPIC_API_KEY || !B) why = NO_BRAIN;
else {
  try {
    try { ({ plan, usage } = await ask(true)); } catch (e) {
      if (!/format|schema|output_config/i.test(String(e))) throw e;
      ({ plan, usage } = await ask(false));
    }
  } catch (e) { why = clean(e?.message ?? e).slice(0, 200); }
}

// ---- a plain plan when Claude isn't there: the hook, then the stretch's own sentences, each its own beat ----------
const sentences = script.filter((l) => l.in).map((l) => String(l.text).trim()).filter(Boolean);
if ((!Array.isArray(plan.beats) || !plan.beats.length) && VO) {
  // with a voiceover and no Claude: a beat per sentence (or about five seconds), its first words on screen
  const beats0 = [];
  let a = 0;
  while (a < phrases.length) {
    let b = a;
    while (b + 1 < phrases.length && !/[.?!]$/.test(phrases[b].text) && phrases[b + 1].end - phrases[a].start < 5.5) b += 1;
    const said = phrases.slice(a, b + 1).map((p) => p.text).join(" ").split(/(?<=[.?!,])\s+/)[0].replace(/[,.!?]$/, "");
    let ws = said.split(/\s+/).slice(0, 9);
    while (ws.length > 3 && /^(the|a|an|to|of|and|or|but|that|with|in|on|for|my|your|i|it)$/i.test(ws[ws.length - 1])) ws.pop();
    beats0.push({ layout: beats0.length % 3 === 2 ? "kinetic" : "statement", text: ws.join(" "), from: a, to: b });
    a = b + 1;
  }
  plan = { beats: beats0, end: {}, notes: `A plain plan that follows the voiceover (${why || "no plan came back"}).` };
}
if (!Array.isArray(plan.beats) || !plan.beats.length) {
  if (prev) plan = { ...prev, notes: `The change wasn't made (${why || "no plan came back"}); this is the reel as it was.` };
  else {
    // whole clauses of 3 to 10 words, with the spoken filler taken out ("um", "I mean", "like")
    const filler = /^(?:(?:and|so|but|yeah|um|uh|i mean|you know|like|right|oh|okay|ok)[,\s]+)+/i;
    const clauses = sentences.join(" ").split(/(?<=[.?!])\s+/).flatMap((x) => x.split(/,\s+/))
      .map((x) => x.replace(/\b(?:um|uh),?\s*/gi, "").replace(/\b(?:like|you know),\s*/gi, "").replace(filler, "").replace(/[,;:]$/, "").trim())
      .filter((x) => x.split(/\s+/).length >= 3 && x.split(/\s+/).length <= 10);
    const short = [...new Set(clauses)].map((x) => x[0].toUpperCase() + x.slice(1)).slice(0, 7);
    const cycle = ["statement", "kinetic", "statement", "quote", "statement", "kinetic", "statement"];
    plan = {
      beats: [{ layout: "statement", text: piece.hook || piece.title || short[0] || "" },
        ...short.map((s, i) => ({ layout: cycle[i % cycle.length], text: s, label: cycle[i % cycle.length] === "quote" ? (st.hasOwner ? st.ownerFull : "") : "" }))],
      end: {}, notes: `A plain plan from the piece's own words (${why || "no plan came back"}).`,
    };
  }
}

// ---- straighten it: the builder only ever sees layouts it knows, words it can fit, and numbers from the source ----
const list = (v) => (Array.isArray(v) ? v : []).filter((x) => x && typeof x === "object");
// no em or en dashes on screen (the Voice Guardrails); quotes straightened; spaces collapsed
const s = (v, max = 200) => String(v ?? "").replace(/\s*[—–]\s*/g, ", ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().slice(0, max).trim();
const words = (t) => t.split(/\s+/).filter(Boolean).length;

// every number on screen must be in the source or the brand's own lines (the end card, the caption)
const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
function spelled(text) {
  // "forty percent" -> 40, "a hundred" -> 100, "two hundred" -> 200, "fifteen thousand" -> 15000
  const out = [];
  const toks = text.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/[\s-]+/);
  let cur = null;
  const flush = () => { if (cur != null) out.push(String(cur)); cur = null; };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t in NUMW) cur = (cur ?? 0) + NUMW[t];
    else if (t === "hundred") cur = (cur ?? 1) * 100;
    else if (t === "thousand") { cur = (cur ?? 1) * 1000; }
    else if (t === "million") { cur = (cur ?? 1) * 1000000; }
    else if (t === "a" && ["hundred", "thousand", "million"].includes(toks[i + 1])) cur = 1;
    else flush();
  }
  flush();
  return out;
}
const END = (plan.end && typeof plan.end === "object") ? plan.end : {};
// the plan's own end card when it has a call to action, else the studio's
const end = s(END.cta, 48) || s(END.url, 50)
  ? { line: s(END.line, 70), cta: s(END.cta, 48), url: s(END.url, 50).replace(/^https?:\/\//, "").replace(/\/$/, "") }
  : { ...END_DEFAULT, line: s(END.line, 70) };
const corpus = [script.map((l) => l.text).join(" "), voWords.map((w) => w.text).join(" "), (ctx.vo?.lines ?? []).join(" "), piece.hook, piece.title, piece.caption, piece.outline, piece.editor_notes, piece.angle, piece.why, end.line, end.cta, end.url].filter(Boolean).join(" ");
const digits = (t) => (String(t).match(/\d[\d,.]*/g) ?? []).map((x) => x.replace(/[,]/g, "").replace(/\.$/, ""));
const known = new Set([...digits(corpus), ...spelled(corpus)]);
const numbersOk = (b) => [b.text, b.value, b.label, b.title, b.before, b.after, b.line, ...(b.rows ?? [])].every((t) => digits(t).every((d) => known.has(d)));

const dropped = [];
let beats = [];
for (const raw of list(plan.beats)) {
  const layout = LAYOUTS.includes(raw.layout) ? raw.layout : "statement";
  const b = {
    layout, text: s(raw.text, 120), key: s(raw.key, 28), value: s(raw.value, 12), label: s(raw.label, 56), title: s(raw.title, 28),
    rows: (Array.isArray(raw.rows) ? raw.rows : []).map((r) => s(typeof r === "string" ? r : r?.text, 34)).filter(Boolean).slice(0, 5),
    before: s(raw.before, 64), after: s(raw.after, 64), line: VO ? "" : s(raw.line, 96),
    from: Math.round(Number(raw.from)), to: Math.round(Number(raw.to)),
  };
  if (b.line && words(b.line) > 16) b.line = b.line.split(/\s+/).slice(0, 16).join(" ");
  if (b.key && !b.text.toLowerCase().includes(b.key.toLowerCase())) b.key = "";
  // each layout needs its own fields; a beat without them becomes a statement of its text, or goes
  if (layout === "number" && !/\d/.test(b.value)) b.layout = "statement";
  if (layout === "list" && b.rows.length < 2) b.layout = "statement";
  if (layout === "before_after" && (!b.before || !b.after)) b.layout = "statement";
  if (b.layout === "statement" && !b.text) b.text = b.label || b.after || b.rows[0] || "";
  if (["statement", "quote", "card", "kinetic"].includes(b.layout) && !b.text) { dropped.push(`${layout} beat with no words`); continue; }
  if (b.layout === "statement" && words(b.text) > 10) b.text = b.text.split(/\s+/).slice(0, 10).join(" ");
  if (b.layout === "kinetic") b.rows = b.rows.slice(0, 2);
  if (!numbersOk(b)) { dropped.push(`"${b.value || b.text}" (a number that isn't in the source)`); continue; }
  beats.push(b);
}
// at most one card beat
let cardSeen = false;
for (const b of beats) { if (b.layout === "card") { if (cardSeen) b.layout = "statement"; cardSeen = true; } }
// never two in a row the same: the second changes to a layout that carries the same words
const swap = { statement: "kinetic", kinetic: "statement", quote: "statement", card: "statement", number: "statement", list: "kinetic", before_after: "statement" };
for (let i = 1; i < beats.length; i++) {
  if (beats[i].layout !== beats[i - 1].layout) continue;
  let to = swap[beats[i].layout];
  if (to === beats[i + 1]?.layout || to === beats[i - 1].layout) to = to === "kinetic" ? "quote" : "kinetic";
  const b = beats[i];
  if (["number", "list", "before_after"].includes(b.layout)) b.text = b.layout === "number" ? `${b.value} ${b.label}`.trim() : b.layout === "list" ? b.rows.slice(0, 2).join(", ") : b.after;
  if (to === "quote" && !b.label) to = "statement";
  b.layout = to;
}
// kinetic about one beat in four: too few and a statement in the middle becomes one; too many and the extras go back
const kin = () => beats.filter((b) => b.layout === "kinetic").length;
for (let i = 2; i < beats.length - 1 && kin() < Math.floor(beats.length / 4); i += 2) {
  if (beats[i].layout === "statement" && beats[i - 1].layout !== "kinetic" && beats[i + 1]?.layout !== "kinetic") beats[i].layout = "kinetic";
}
for (let i = beats.length - 1; i >= 0 && kin() > Math.ceil(beats.length / 3); i--) {
  if (beats[i].layout === "kinetic" && i > 0 && beats[i - 1].layout !== "statement" && beats[i + 1]?.layout !== "statement") beats[i].layout = "statement";
}
// the hook opens: a statement or a kinetic beat (with a voiceover, the first beat is his own first words)
if (VO && beats[0] && !["statement", "kinetic"].includes(beats[0].layout)) beats[0].layout = "statement";
if (!VO && beats[0] && !["statement", "kinetic"].includes(beats[0].layout)) {
  beats.unshift({ layout: "statement", text: s(piece.hook, 90).split(/\s+/).slice(0, 10).join(" ") || beats[0].text, key: "", value: "", label: "", title: "", rows: [], before: "", after: "", line: "" });
}
beats = beats.slice(0, VO ? 14 : 12);
// with a voiceover every phrase belongs to exactly one beat, in order: each beat starts where the last one stopped
if (VO) {
  const P = phrases.length;
  beats = beats.filter((b) => Number.isFinite(b.from) && b.from < P).sort((x, y) => x.from - y.from);
  if (!beats.length) beats = [{ layout: "statement", text: phrases.map((p) => p.text).join(" ").split(/\s+/).slice(0, 9).join(" "), key: "", value: "", label: "", title: "", rows: [], before: "", after: "", line: "", from: 0, to: P - 1 }];
  let next = 0;
  for (const b of beats) { b.from = next; b.to = Math.min(P - 1, Math.max(b.from, Number.isFinite(b.to) ? b.to : b.from)); next = b.to + 1; }
  beats = beats.filter((b) => b.from <= b.to);
  beats[beats.length - 1].to = P - 1;
}

const out = { beats, end, notes: s(plan.notes, 1200), title: s(piece.title, 90), hook: s(piece.hook, 140) };
if (VO) Object.assign(out, { vo: true, phrases: phrases.map((p) => ({ start: Math.round(p.start * 1000) / 1000, end: Math.round(p.end * 1000) / 1000, text: p.text })), hook: s(ctx.vo.lines?.[0] || piece.hook, 140) });
if (prev) out.revision = String(ctx.change).trim().slice(0, 2000);
if (dropped.length) out.dropped = dropped;
fs.mkdirSync("work", { recursive: true });
fs.writeFileSync("work/plan.json", JSON.stringify(out, null, 1));
console.log(why && !process.env.PLAN_FILE ? `plan: plain (${why}), ${beats.length} beats`
  : `plan: ${VO ? `follows the voiceover (${phrases.length} phrases), ` : ""}${beats.length} beats (${beats.map((b) => b.layout).join(", ")}), end card: ${end.cta || end.url || "name only"}${dropped.length ? `; left out ${dropped.join("; ")}` : ""}${usage ? `; ${usage.input_tokens} in / ${usage.output_tokens} out tokens` : ""}`);
if (out.notes) console.log(`editor's note: ${out.notes}`);
