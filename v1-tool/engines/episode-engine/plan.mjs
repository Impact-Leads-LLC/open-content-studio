// The episode plan (episode engine): Claude reads the whole episode with its word timings and the studio's brand (the
// brain), then decides what every episode gets by default, so nobody has to ask for it each time: the title on the
// title card, a cold open, chapters, a graphic every two or three minutes, the lines worth a punch-in, the caption key
// words, caption fixes, each person's name card line and the end card. The look is fixed in build.py; this decides the
// content. Writes work/plan.json.
// Needs ANTHROPIC_API_KEY, BRAIN_MCP_URL and BRAIN_MCP_TOKEN (optional CLAUDE_MODEL); without them (or if the call
// fails) a plain plan comes out, so the episode still gets its captions, moves, title, name and end cards.
import fs from "node:fs";
import { brain, brainRules, DOCS, MODEL, NO_BRAIN, studioOf } from "./studio.mjs";

const ctx = fs.existsSync("context.json") ? JSON.parse(fs.readFileSync("context.json", "utf8")) : {};
const st = studioOf(ctx);
const edit = JSON.parse(fs.readFileSync("work/edit.json", "utf8"));
const raw = JSON.parse(fs.readFileSync("work/words.json", "utf8"));
const START = edit.start, DUR = edit.dur;
const people = edit.people.map((p) => p.name);
const host = edit.people.find((p) => p.key === "bot")?.name ?? st.owner;
const guest = edit.people.find((p) => p.key === "top")?.name ?? ctx.episode?.guest ?? "";
// every word on the edit's clock (seconds from the start of the edit)
const words = (Array.isArray(raw) ? raw : raw.words ?? [])
  .map((w) => ({ who: w.who, text: String(w.text).trim(), start: w.start - START, end: w.end - START }))
  .filter((w) => w.text && w.start >= 0 && w.start < DUR)
  .sort((a, b) => a.start - b.start);
const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

// the transcript the editor reads: one line per sentence or so, with its start time and speaker
const lines = [];
for (const w of words) {
  const l = lines[lines.length - 1];
  if (l && l.who === w.who && w.start - l.last < 1.5 && !(/[.?!]$/.test(l.text) && w.start - l.at >= 6) && w.start - l.at < 20) {
    l.text += ` ${w.text}`; l.last = w.end;
  } else lines.push({ at: w.start, who: w.who, text: w.text, last: w.end });
}

const str = { type: "string" }, num = { type: "number" };
const obj = (props) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const KINDS = ["list", "checklist", "stat", "compare", "quote", "message", "site"];
const SCHEMA = obj({
  title: str,
  format: obj({ type: { type: "string", enum: ["masterclass", "coaching", "expert"] }, topic: str }),
  teaser: obj({ bites: { type: "array", items: obj({ in: num, out: num }) }, intro: obj({ in: num, out: num }), ad: obj({ in: num, out: num, offer: str, url: str }), body_from: num }),
  chapters: { type: "array", items: obj({ at: num, title: str }) },
  names: { type: "array", items: obj({ who: str, line: str, trust: str, role: { type: "string", enum: ["guest", "collaborator", "host"] } }) },
  graphics: { type: "array", items: obj({
    kind: { type: "string", enum: KINDS },
    at: num, until: num, title: str, label: str, value: str, text: str, url: str,
    app: { type: "string", enum: ["", "email", "dm", "linkedin", "text"] },
    rows: { type: "array", items: obj({ text: str, at: num }) },
    bars: { type: "array", items: obj({ label: str, value: num }) },
  }) },
  punches: { type: "array", items: obj({ at: num, until: num }) },
  pops: { type: "array", items: obj({ at: num, text: str }) },
  keys: { type: "array", items: str },
  fixes: { type: "array", items: obj({ at: num, from: str, to: str }) },
  end: obj({ line: str, cta: str, url: str }),
  notes: str,
});

const system = `You are the episode editor in ${st.brand}'s content studio. You plan the produced version of one full podcast
episode of ${st.show || "the show"}. The host is ${st.ownerFull}; the audience is ${st.audience}. A fixed builder renders
the look; you decide the content. Every episode gets all of this by default, so plan all of it:

- format: what type of episode it is. masterclass = the host teaching on their own; coaching = a free coaching session,
  the host coaching the guest live on the guest's own problem; expert = the guest teaches what they know. topic = what
  it's about in 2 to 6 plain words (e.g. "How to generate leads"). It goes on the guest's intro card and the title card.
- title: the episode title on the title card over the opening. A number and an outcome, in the listener's words, under 60
  characters. No vague insider titles. It may differ from the working title.
- teaser: the opening, 30 to 40 seconds with the ad read, before the title card. bites: one to three sound bites from
  the middle of the episode that build anticipation (a sharp claim, a number, a story turn), each 4 to 10 seconds,
  together 10 to 18 seconds, each starting and ending on a full sentence, in the order they should play.
  intro: the tightest stretch, 5 to 22 seconds, where the host introduces the guest in the recording (usually in the
  first minute: the guest's name and what they do; skip asides like small talk about pronunciation); in = -1 if they
  never do. ad: when the host reads an ad live as part of the intro: the stretch where it's read (what it's for, where
  to go), 6 to 60 seconds, usually right before or after the guest's introduction; offer = what it's for in a few words
  (e.g. "Free strategy call"), url = where it goes as said or from the brand brief; in = -1 if there's no ad read in
  the recording. body_from: where the episode itself starts, after the host's whole introduction, the ad read and the
  hellos (so nothing in the teaser is heard twice); 0 if there's no introduction. The teaser plays the bites, then the
  host's introduction with the guest's intro card, then the ad read with the offer on screen, then the title card and
  the episode.
- chapters: 4 to 8 topic changes, each with a 2 to 6 word title in plain words. The first starts at 0. At least 60
  seconds apart. These become chapter cards and the YouTube chapters.
- names: one entry per person (${people.join(", ")}). Every person on screen who isn't the host gets introduced: who
  they are, why the viewer should trust them, and whether they're a guest or someone the host is collaborating with.
  line: who they are (under 45 characters, e.g. "Founder, Brightline Studio"); trust: why to trust them, from the
  episode (under 50 characters, e.g. "12 years in brand design"); role: guest, collaborator or host (${host} is the
  host; the host's line and trust come from the brand brief).
- graphics: one every two or three minutes (10 to 15 in a 30-minute episode, fewer in a short one), each on the line it
  shows, 6 to 12 seconds long, at least 25 seconds apart, never in the first 10 seconds or the last 15. The speaker
  moves into a window and the graphic builds beside them. Kinds:
  list (title + 2 to 5 short rows, each row's "at" = when it's said), checklist (same, for steps or criteria),
  stat (value = the number exactly as said, e.g. "15,000" or "95%", label = what it counts, title optional),
  compare (title + 2 to 4 bars with a label and a value; only real numbers said in the episode),
  quote (text = a line said in the episode, word for word, under 20 words; label = who said it),
  message (app = email|dm|linkedin|text, title = who it's to, text = the message as described in the episode),
  site (url = the real public homepage or product page of a tool, website, app or product talked about by name (never
  an app's sign-in screen), or the guest's own site
  ${ctx.guest_site ? `(${ctx.guest_site})` : ""}; title = what it is). Whenever a tool, a website or a product comes up
  by name, show it (up to 6 site graphics), on the line that names it, unless a screen share already shows it then.
  Rows, titles and labels are short (rows under 32 characters, titles under 28).
- punches: 8 to 20 short punch-ins (1.5 to 4 seconds) on the lines that land: a number, a sharp claim, a punchline. Never
  inside a graphic.
- pops: 8 to 16 stickers that hover beside the speaker for about 3 seconds on a line worth remembering: text = 2 to 5
  words said in the episode, word for word; at = when the first of them is said. Spread them through the episode, at
  least 20 seconds from a graphic. With the graphics, chapters and punch-ins they keep the episode from sitting flat:
  never more than 25 seconds without one of them.
- keys: 15 to 40 single words or two-word phrases that pop into a white box in the captions: the word a line turns on
  (a number, a name, the punchline word). At most one per sentence. Numbers turn to the accent colour on their own.
- fixes: words the speech-to-text got wrong, where the meaning makes it clear (names, brands, numbers); at = when it's said.
- end: the end card over the last seconds: line = what the call to action gets the viewer, in their words (so it's
  clear what they're signing up for); cta = the call to action from the brand brief${st.bookingUrl ? ` (for example "Book your free call")` : ""};
  url = its page from the brand brief${st.bookingUrl ? ` (the booking page is ${st.bookingUrl})` : st.website ? ` (the website is ${st.website})` : ""}.
  The ad read's offer on screen uses the same line.

Start by calling get_brand_brief, then read the brain docs "${DOCS.episode}", "${DOCS.reel}", "${DOCS.voice}",
"${DOCS.guardrails}" and "${DOCS.avoidAi}" (brain_search, brain_get_document). The brain wins over anything here.
${brainRules(st)} Every word on screen comes from the episode or the brand brief. Follow the Voice Guardrails (no em
dashes). Times are seconds on the episode's clock, the numbers in brackets in the transcript. Return only the JSON.`;

const user = [
  `Episode: ${ctx.episode?.title ?? ""} (${ctx.episode?.show ?? ""}). People: ${guest ? `${guest} (guest), ` : ""}${host} (host).`,
  ctx.guest_site ? `The guest's website: ${ctx.guest_site}` : "",
  ctx.notes ? `The team's notes for this episode (follow them unless one breaks a brand rule, and say so in notes if you skip one):\n${ctx.notes}` : "",
  Array.isArray(ctx.rules) && ctx.rules.length ? `Rules ${st.owner} added from past reviews (they beat everything except the Voice Guardrails):\n${ctx.rules.map((r) => `- ${r}`).join("\n")}` : "",
  `The episode is ${clock(DUR)} long (${DUR.toFixed(1)} seconds). Transcript:`,
  lines.map((l) => `[${l.at.toFixed(1)}] ${l.who}: ${l.text}`).join("\n"),
].filter(Boolean).join("\n\n");

const B = brain();

// max_tokens: thinking, the brain lookups and the plan all count against it. 24,000 ran out on a 28-minute episode
// before the plan began (245 s, no plan), so a whole episode gets a large budget.
async function ask(withSchema, effort = "medium") {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const messages = [{ role: "user", content: user }];
  const params = {
    model: MODEL,
    max_tokens: 64000,
    output_config: withSchema ? { effort, format: { type: "json_schema", schema: SCHEMA } } : { effort },
    betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
    fallbacks: "default",
    mcp_servers: B.mcp_servers,
    tools: B.tools,
    system,
  };
  // the brain lookups run on Anthropic's side; a long run of them pauses the turn, and sending it back carries on
  let msg, out = 0;
  for (let i = 0; i < 4; i++) {
    msg = await client.beta.messages.stream({ ...params, messages }).finalMessage();
    out += msg.usage?.output_tokens ?? 0;
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  if (msg.stop_reason === "refusal") throw new Error("The model declined this plan.");
  const texts = msg.content.filter((b) => b.type === "text").map((b) => b.text);
  const m = (texts[texts.length - 1] ?? "").match(/\{[\s\S]*\}/) ?? texts.join("\n").match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`The editor didn't return a plan (stopped: ${msg.stop_reason}, ${out} tokens out).`);
  let plan;
  try { plan = JSON.parse(m[0]); } catch { throw new Error(`The editor's plan was cut off (stopped: ${msg.stop_reason}, ${out} tokens out).`); }
  return { plan, usage: { ...msg.usage, output_tokens: out } };
}

let plan = {}, usage = null, why = "";
if (process.env.PLAN_FILE) plan = JSON.parse(fs.readFileSync(process.env.PLAN_FILE, "utf8"));   // a plan made elsewhere (tests)
else if (!process.env.ANTHROPIC_API_KEY || !B) why = NO_BRAIN;
else {
  try {
    try { ({ plan, usage } = await ask(true)); } catch (e) {
      if (/format|schema|output_config/i.test(String(e))) ({ plan, usage } = await ask(false));
      // no plan or half a plan: one more go, thinking less, so the episode still gets its chapters and graphics
      else if (/didn't return a plan|was cut off/.test(String(e))) {
        console.log(`plan: first try failed, trying again (${String(e?.message ?? e).slice(0, 160)})`);
        ({ plan, usage } = await ask(true, "low"));
      } else throw e;
    }
  } catch (e) { why = String(e?.message ?? e).replace(/sk-ant-[A-Za-z0-9_-]+/g, "[key]").replace(/(token|sig|signature)=[^&\s]+/gi, "$1=[...]").slice(0, 200); }
}

// ---- straighten it: the builder only ever sees times inside the episode, graphics that don't overlap, and so on ----
const list = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []).filter((x) => x && typeof x === "object");
const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const s = (v, max = 200) => String(v ?? "").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, max);
const out = { title: s(plan.title, 90) || s(ctx.episode?.title, 90) || "", notes: s(plan.notes, 1200) };
const fm = plan.format && typeof plan.format === "object" ? plan.format : {};
out.format = { type: ["masterclass", "coaching", "expert"].includes(fm.type) ? fm.type : "", topic: s(fm.topic, 44) };

// the teaser: bites from the middle (never overlapping, inside the episode, 28 s at most together), then the host's
// introduction of the guest; the episode body starts after that introduction when it's in the first two minutes
const tz = plan.teaser && typeof plan.teaser === "object" ? plan.teaser : plan.cold_open ? { bites: [plan.cold_open] } : {};
const bites = [];
let total = 0;
for (const b of list(tz.bites)) {
  const bi = { in: n(b.in, -1), out: n(b.out, -1) };
  const len = bi.out - bi.in;
  if (bi.in < 30 || bi.out > DUR - 20 || len < 3 || len > 12 || total + len > 20) continue;
  if (bites.some((x) => bi.in < x.out && bi.out > x.in)) continue;
  bites.push(bi); total += len;
  if (bites.length === 3) break;
}
let intro = tz.intro && typeof tz.intro === "object" ? { in: n(tz.intro.in, -1), out: n(tz.intro.out, -1) } : null;
if (intro && (intro.in < 0 || intro.in > 120 || intro.out - intro.in < 3 || intro.out - intro.in > 24)) intro = null;
// an ad read the host records in the intro: plays after the guest's intro, never overlapping it or a bite
const ta = tz.ad && typeof tz.ad === "object" ? tz.ad : null;
let ad = ta ? { in: n(ta.in, -1), out: n(ta.out, -1), offer: s(ta.offer, 40), url: s(ta.url, 60).replace(/^https?:\/\//, "").replace(/\/$/, "") } : null;
if (ad && (ad.in < 0 || ad.in > 240 || ad.out - ad.in < 6 || ad.out - ad.in > 75 || ad.out > DUR - 60)) ad = null;
if (ad && intro && ad.in < intro.out && ad.out > intro.in) ad = null;
if (ad && bites.some((b) => ad.in < b.out && ad.out > b.in)) ad = null;
out.teaser = { bites, intro, ad };
// the episode starts after the whole introduction, the ad read and the hellos, never before the part the teaser played
const from = n(tz.body_from, -1);
const opened = Math.max(intro ? intro.out : 0, ad ? ad.out : 0);
out.body_start = opened ? Math.round(Math.max(opened, from >= opened && from <= opened + 60 ? from : opened) * 30) / 30 : 0;

const ch = list(plan.chapters).map((c) => ({ at: Math.max(0, n(c.at)), title: s(c.title, 40) })).filter((c) => c.title && c.at < DUR - 30).sort((a, b) => a.at - b.at);
const chapters = [];
for (const c of ch) if (!chapters.length || c.at - chapters[chapters.length - 1].at >= 45) chapters.push(c);
if (chapters.length) chapters[0].at = out.body_start;
while (chapters.length > 1 && chapters[1].at - chapters[0].at < 45) chapters.splice(1, 1);
out.chapters = chapters.length >= 3 ? chapters : [];

out.names = list(plan.names).map((x) => ({ who: s(x.who, 40), line: s(x.line, 60), trust: s(x.trust, 70), role: ["guest", "collaborator", "host"].includes(x.role) ? x.role : "" })).filter((x) => x.who);

const gfx = [];
for (const g of list(plan.graphics).sort((a, b) => n(a.at) - n(b.at))) {
  const kind = KINDS.includes(g.kind) ? g.kind : "list";
  let at = n(g.at, -1), until = n(g.until, at + 8);
  if (at < out.body_start + 10 || at > DUR - 20) continue;
  until = Math.min(Math.max(until, at + 6), at + 12, DUR - 12);
  if (gfx.length && at - gfx[gfx.length - 1].until < 20) continue;
  const rows = list(g.rows).map((r) => ({ text: s(r.text, 40), at: Math.min(Math.max(n(r.at, at), at), until - 1) })).filter((r) => r.text).slice(0, 5);
  const bars = list(g.bars).map((b) => ({ label: s(b.label, 28), value: n(b.value) })).filter((b) => b.label && b.value > 0).slice(0, 4);
  const item = { kind, at, until, title: s(g.title, 36), label: s(g.label, 60), value: s(g.value, 14), text: s(g.text, 240), url: s(g.url, 200), app: s(g.app, 10), rows, bars };
  if ((kind === "list" || kind === "checklist") && rows.length < 2) continue;
  if (kind === "compare" && bars.length < 2) continue;
  if (kind === "stat" && !item.value) continue;
  if ((kind === "quote" || kind === "message") && !item.text) continue;
  if (kind === "site" && !/^https?:\/\/[^\s/]+\.[^\s]+/.test(item.url) && !/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(item.url)) continue;
  gfx.push(item);
}
let sites = 0;
out.graphics = gfx.filter((g) => g.kind !== "site" || ++sites <= 6).slice(0, 18);
const inGfx = (t) => out.graphics.some((g) => t > g.at - 1.5 && t < g.until + 1.5);
out.punches = list(plan.punches).map((p) => ({ at: n(p.at, -1), until: n(p.until, -1) }))
  .filter((p) => p.at > out.body_start + 8 && p.until > p.at && p.until < DUR - 10 && !inGfx(p.at) && !inGfx(p.until))
  .map((p) => ({ at: p.at, until: Math.min(p.until, p.at + 4, p.at + Math.max(1.5, p.until - p.at)) }))
  .sort((a, b) => a.at - b.at)
  .filter((p, i, a) => i === 0 || p.at - a[i - 1].until > 8)
  .slice(0, 24);
// pops: stickers on lines worth remembering, never in a graphic or a punch-in
const busy = (t, pad) => out.graphics.some((g) => t > g.at - pad && t < g.until + pad) || out.punches.some((p) => t > p.at - 2 && t < p.until + 2);
out.pops = list(plan.pops).map((p) => ({ at: n(p.at, -1), text: s(p.text, 34) }))
  .filter((p) => p.text && p.text.split(/\s+/).length <= 6 && p.at > out.body_start + 12 && p.at < DUR - 15 && !busy(p.at, 6) && !busy(p.at + 3.2, 6))
  .sort((a, b) => a.at - b.at)
  .filter((p, i, a) => i === 0 || p.at - a[i - 1].at > 12)
  .slice(0, 20);
// never flat for long (no more than 20 or 30 seconds on something completely flat): any stretch over 26 seconds with no graphic, chapter, screen share, punch-in or pop gets a punch-in on the
// first sentence that starts inside it
let shares = [];
try { shares = JSON.parse(fs.readFileSync("work/broll.json", "utf8")).map((b) => [b.offset - edit.start, b.offset - edit.start + b.len]); } catch {}
const beats = () => [
  ...out.graphics.map((g) => [g.at - 0.7, g.until + 0.7]), ...out.chapters.map((c) => [c.at, c.at + 4.2]),
  ...out.punches.map((p) => [p.at, p.until]), ...out.pops.map((p) => [p.at, p.at + 3.2]), ...shares,
  [0, out.body_start + 8], [DUR - 10, DUR],
].sort((a, b) => a[0] - b[0]);
for (let guard = 0; guard < 80; guard++) {
  let t = 0, gap = null;
  for (const [a, b] of beats()) { if (a - t > 26) { gap = [t, a]; break; } t = Math.max(t, b); }
  if (!gap) break;
  const at = lines.map((l) => l.at).find((x) => x > gap[0] + 9 && x < gap[1] - 4) ?? gap[0] + Math.min(14, (gap[1] - gap[0]) / 2);
  out.punches.push({ at, until: at + 2.5, auto: true });
  out.punches.sort((a, b) => a.at - b.at);
}
out.keys = (Array.isArray(plan.keys) ? plan.keys : []).filter((k) => typeof k === "string" && k.trim()).map((k) => k.trim()).slice(0, 80);
out.fixes = list(plan.fixes).map((f) => ({ at: n(f.at, -1), from: s(f.from, 60), to: s(f.to, 60) })).filter((f) => f.at >= 0 && f.from && f.to);
const end = plan.end && typeof plan.end === "object" ? plan.end : {};
// with no plan (or no end card in it), the end card falls back to the studio's booking page or website
const bare = (u) => s(u, 60).replace(/^https?:\/\//, "").replace(/\/$/, "");
out.end = { line: s(end.line, 80), cta: s(end.cta, 70) || (st.bookingUrl ? "Book a call" : ""), url: bare(end.url) || bare(st.bookingUrl || st.website) };
out.people = edit.people.map((p) => ({ key: p.key, name: p.name }));

fs.writeFileSync("work/plan.json", JSON.stringify(out, null, 1));
console.log(why ? `plan: plain (${why})`
  : `plan: "${out.title}", teaser ${out.teaser.bites.length} bite(s)${out.teaser.intro ? ` + host's intro ${clock(out.teaser.intro.in)}-${clock(out.teaser.intro.out)}` : ""}, ${out.chapters.length} chapters, ${out.graphics.length} graphics (${out.graphics.map((g) => g.kind).join(", ")}), ${out.punches.length} punch-ins (${out.punches.filter((p) => p.auto).length} added so it's never flat), ${out.pops.length} pops${out.teaser.ad ? `, ad read ${clock(out.teaser.ad.in)}-${clock(out.teaser.ad.out)}` : ""}${usage ? `; ${usage.input_tokens} in / ${usage.output_tokens} out tokens` : ""}`);
if (out.notes) console.log(`editor's note: ${out.notes}`);
