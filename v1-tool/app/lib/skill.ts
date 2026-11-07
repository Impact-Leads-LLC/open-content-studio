import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Platform } from "./platforms";
import { BRAIN_RULES, BRAIN_TOOLS, COACH, DOC, OWNER, OWNER_FULL, MODEL, AUDIENCE } from "./brand";
import { brain } from "./brain";

// The skills ship with the app, the same files the team's Claude loads.
const read = (p: string) => readFileSync(path.join(process.cwd(), "skills", p), "utf8");
const LINKEDIN = [
  ["linkedin-content", read("linkedin-content/SKILL.md")],
  ["linkedin-content/references/post-types.md", read("linkedin-content/references/post-types.md")],
].map(([name, body]) => `<skill name="${name}">\n${body}\n</skill>`).join("\n\n");

const BRAIN = `${BRAIN_TOOLS} Start by calling get_brand_brief. The brain is the authority on voice, audience, offers and
proof. Ideas from a podcast guest belong to the guest: credit them by name and never present their advice as ${OWNER}'s own.`;

const GATE = `Delivery gate before answering: run the "${DOC.avoidAi}" audit from the brain (draft, ask what still reads as AI,
rewrite), then sweep against "${DOC.guardrails}" (the banned phrases and framings).`;

export type Block = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };

// One call to Claude with the brain connected. `schema` asks for JSON in that exact shape.
export async function run(system: string, user: string | Block[], schema?: Record<string, unknown>) {
  return retryDropped(async () => {
    try {
      return await call(system, user, schema);
    } catch (e) {
      // If structured output isn't accepted alongside the connector, ask again without it and parse the JSON by hand.
      if (schema && /format|schema|output_config/i.test(String(e))) return call(system, user);
      throw e;
    }
  });
}

// The brain connector sometimes drops while Claude lists its tools (one of four captions written at once failed with
// "MCP server returned an error while listing tools: Connection closed"). Nothing was written yet, so it's safe to ask
// again: two more tries, a few seconds apart.
const DROPPED = /MCP server returned an error|Connection closed/i;
export async function retryDropped<T>(fn: () => Promise<T>, waits = [3000, 10000]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= waits.length || !DROPPED.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, waits[i]));
    }
  }
}

async function call(system: string, user: string | Block[], schema?: Record<string, unknown>) {
  const b = brain();
  const params = {
    model: MODEL,
    max_tokens: 64000,
    output_config: schema ? { effort: "medium", format: { type: "json_schema", schema } } : { effort: "medium" },
    betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
    fallbacks: "default",
    mcp_servers: [{ type: "url", name: "brain", url: b.url, authorization_token: b.token }],
    tools: [{ type: "mcp_toolset", mcp_server_name: "brain" }],
    system,
  };
  // The brain lookups run on Anthropic's side, and a long run of them pauses the turn (stop_reason pause_turn): sending
  // it back carries on. A paused or cut-off answer used to come back as empty or half text and the caller saw "nothing
  // found", so now both say what happened.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "user", content: user }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let msg: any, input = 0, output = 0;
  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    msg = await new Anthropic().beta.messages.stream({ ...params, messages } as any).finalMessage();
    input += msg.usage?.input_tokens ?? 0;
    output += msg.usage?.output_tokens ?? 0;
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }
  if (msg.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (msg.stop_reason === "max_tokens") throw new Error(`The answer was cut off at the length limit (${output} tokens out).`);
  if (msg.stop_reason === "pause_turn") throw new Error("The brain lookups didn't finish after five rounds.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks = msg.content as any[];
  const texts = blocks.filter((b) => b.type === "text").map((b) => b.text as string);
  return {
    text: texts.join("\n").trim(),
    last: (texts[texts.length - 1] ?? "").trim(),
    usage: { input, output },
    stop: String(msg.stop_reason ?? ""),
  };
}

const WRITER = `You are the content engine in ${OWNER_FULL}'s studio app, working as a member of ${OWNER}'s content team.
The content is for ${AUDIENCE}.
Follow the linkedin-content skill below, whole and in order. Where it says to run SQL against the brain, use the
connector tools instead. Where the skill or its examples disagree with the brain (retired phrases, contrast
constructions), the brain wins. ${BRAIN}
The brain's "${DOC.review}" is how ${COACH} reviews content: every post is judged against its seven checks, so write to
pass them. Every number and claim must come from the source with its original condition and owner. The source is the
episode (or the idea) and ${OWNER}'s training material in the brain: when the material names brain documents, read them
(brain_search, brain_get_document) and build the post out with what ${OWNER} teaches there, the steps, scripts,
frameworks and client results, so the reader gets something to keep. ${BRAIN_RULES}
Never invent ${OWNER}'s opinions, stories or experiences.
This run has no person to answer questions, so the intake is settled: scope is one post, the raw material is the
user's message, and the concept in it sets the angle. ${GATE} Put the finished post between <post> and </post>, ready
to paste: no type label, no hashtags. The highest intention of every post is that people save it to use later, so give
them something worth keeping, and just before the next step, one plain line asking them to save it.
End it on one plain next step that fits the reader (the door test): for a guest episode, the full episode with the
guest. Then, between <card> and </card>, the words for the branded graphic that goes out with the post: its point in 4
to 12 words, in ${OWNER}'s words from the post, with the one key word or number wrapped in *asterisks* (it turns the
accent colour). Anything the team should know (a line to check with ${OWNER}, a choice you made) goes after </card>; it
lands in the team's thread and never in the post.`;

// The post sits between <post> tags and the graphic's words between <card> tags; anything outside them is a note for
// the team.
export function splitPost(text: string) {
  const c = text.match(/<card>\s*([\s\S]*?)\s*<\/card>/i);
  const card = c ? c[1].replace(/\s+/g, " ").trim() : "";
  const rest = c ? text.replace(c[0], "") : text;
  const m = rest.match(/<post>\s*([\s\S]*?)\s*<\/post>/i);
  if (!m) return { body: rest.trim(), note: "", card };
  return { body: m[1].trim(), note: rest.replace(m[0], "").trim(), card };
}

export async function writePost(material: string) {
  return run(`${WRITER}\n\n${LINKEDIN}`, material);
}

// Rewrite a draft with the coach's fixes, the owner's answers and the team's instruction.
export async function revisePost(material: string) {
  const system = `${WRITER}
This run revises an existing draft. Keep what works. Apply each of ${COACH}'s fixes and the team's instruction.
Cut any number or claim that isn't in the source excerpt. If ${OWNER} answered a question or gave feedback, use those
words for ${OWNER}'s take. If the ${OWNER} test failed and ${OWNER} hasn't answered yet, stay true to the guest's point
and leave ${OWNER}'s take out rather than inventing one.

${LINKEDIN}`;
  return run(system, material);
}

// The caption that goes out with a reel or carousel, the same on every network, written the way the LinkedIn skill
// writes, ending on the main network's call to action from ctaPlan (lib/platforms.ts); `endings` are the
// last paragraphs for networks whose next step works differently.
export async function writeCaptions(material: string, platforms: Platform[], base: Platform, plans: string, images: string[] = []) {
  const system = `You write the caption that goes out with one of ${OWNER_FULL}'s reels or carousels. ${BRAIN}
It goes out the same on every network it's posted to, so write one caption that works on all of them; only its last
paragraph, the next step, can differ by network. How ${OWNER} writes comes from the brain's voice documents and the
LinkedIn skill below: its hooks, structure, voice rules and humanizer pass apply here too.
Shape:
- The first line is the hook and works on its own: Instagram shows about 125 characters before "more", and YouTube uses
  the first line as the title, so keep it under 90 characters.
- Then two to four short paragraphs, then one plain line asking them to save it for later (the highest intention of
  every piece is that people save it), then the call to action in its own last paragraph.
- Under 2,000 characters. Where a network takes less (Threads takes 500), the app keeps the first paragraph, the
  paragraphs after it that fit, and the last one, so the first two paragraphs carry the point on their own.
The brain's "${DOC.review}" is how ${COACH} reviews: the caption is judged by the same checks, so write to pass them.
Every number and claim comes from the source with its original condition and owner. Never invent ${OWNER}'s opinions,
stories or experiences; a guest's idea is credited to the guest by name. No hashtags unless the brand brief asks for them. One call to action, as the plan says; a keyword is written in capitals exactly as given. A link goes in
only when it's given to you: never a placeholder such as [LINK] or [EPISODE URL], and never a made-up URL. ${GATE}

${LINKEDIN}`;
  const schema = {
    type: "object", additionalProperties: false, required: ["caption", "endings", "notes"],
    properties: {
      caption: { type: "string" },
      endings: { type: "array", items: { type: "object", additionalProperties: false, required: ["network", "last"], properties: { network: { type: "string", enum: platforms }, last: { type: "string" } } } },
      notes: { type: "string" },
    },
  };
  const ask = `${material}\n\nHow the next step works on each network:\n${plans}\n\nIt goes out on: ${platforms.join(", ")}. ${base} is the main network, so the caption's last paragraph is the next step as it works on ${base}.\nendings: for each other network where that last paragraph doesn't work as written ("link in bio" on LinkedIn, a comment where people DM the keyword, a link to write out), the last paragraph as it should read there, in the same voice and nothing else changed. Leave out every network where it works as written.\nnotes: anything else the team should know. Answer with the JSON only.`;
  // a carousel's slide images, when there's no slide copy on file
  const user: string | Block[] = images.length ? [{ type: "text", text: ask }, ...images.map((url): Block => ({ type: "image", source: { type: "url", url } }))] : ask;
  const r = await run(system, user, schema);
  const json = (r.last.match(/\{[\s\S]*\}/) ?? r.text.match(/\{[\s\S]*\}/) ?? ["{}"])[0];
  const out = JSON.parse(json) as { caption?: string; notes?: string; endings?: { network?: string; last?: string }[] };
  const endings = (out.endings ?? []).filter((e) => platforms.includes(e.network as Platform) && e.last?.trim()).map((e) => ({ network: e.network as Platform, last: String(e.last).trim() }));
  return { caption: String(out.caption ?? "").trim(), endings, note: String(out.notes ?? "").trim(), usage: r.usage };
}

// The coach's first look at a drafted caption, before the team sees it (a filter it goes through first, so there are
// fewer suggestions and fewer edits along the way): the checks, with the lines that fail rewritten. A caption that
// passes comes back as it is.
export async function polishCaption(caption: string, material: string, rules: string[]) {
  const system = `You are ${COACH}, the review layer in ${OWNER_FULL}'s content studio, reading a caption before the team
sees it, so whatever you catch is fixed before anyone has to ask. ${BRAIN} Your standard is the brain's "${DOC.review}"
(the seven checks in priority order).
${rules.length ? `Rules ${OWNER} added from their own reviews (they beat everything except the ${DOC.guardrails}):\n${rules.map((r) => `- ${r}`).join("\n")}\n` : ""}
Check the caption: the first line passes the stop test (a number and an outcome, in words ${AUDIENCE} would use);
every number and claim matches the source with its condition and owner; a guest's idea is credited to the guest; when
${OWNER} makes their own point in the moment, it's in there; one next step; the ${DOC.guardrails}; a fifth-grade reading
level (one idea per sentence). Fix only the lines that fail, in ${OWNER}'s voice, using only facts from the source, and
keep everything else word for word, including the call to action. ${GATE}
caption: the caption with your fixes made (exactly as it was when it passes). changes: one short plain line per change,
empty when it passes. Answer with the JSON only.`;
  const schema = {
    type: "object", additionalProperties: false, required: ["caption", "changes"],
    properties: { caption: { type: "string" }, changes: { type: "array", items: { type: "string" } } },
  };
  const r = await run(system, `${material}\n\nThe caption:\n<<<\n${caption}\n>>>`, schema);
  const json = (r.last.match(/\{[\s\S]*\}/) ?? r.text.match(/\{[\s\S]*\}/) ?? ["{}"])[0];
  const out = JSON.parse(json) as { caption?: string; changes?: string[] };
  return { caption: String(out.caption ?? "").trim() || caption, changes: (out.changes ?? []).map(String).filter(Boolean), usage: r.usage };
}

// The written caption that goes out with a reel or carousel (Instagram, TikTok, LinkedIn, YouTube Shorts).
export async function writeCaption(material: string) {
  const system = `You write the caption that goes out with one of ${OWNER_FULL}'s reels or carousels. ${BRAIN}
The brain's "${DOC.review}" is how ${COACH} reviews: the caption is judged by the same checks, so write to pass them.
Every number and claim comes from the source with its original condition and owner. Never invent ${OWNER}'s opinions,
stories or experiences; a guest's idea is credited to the guest by name.
Shape: the first line is the hook and must work on its own, because Instagram shows only about 125 characters before
"more" (a number, an outcome, the listener's words). Then two to four short lines that give the one point, then one
plain line asking them to save it for later (the highest intention of every piece). End on one
plain next step that fits the reader; for a guest episode, the full episode with the guest. No hashtags unless the brand
brief asks for them. Under 900 characters. ${GATE}
Put the caption between <caption> and </caption>, ready to paste. Anything the team should know goes after it.`;
  const r = await run(system, material);
  const m = r.text.match(/<caption>\s*([\s\S]*?)\s*<\/caption>/i);
  return { caption: (m ? m[1] : r.text).trim(), note: m ? r.text.replace(m[0], "").trim() : "", usage: r.usage };
}

export type Concept = { kind: "reel" | "carousel" | "post"; title: string; hook: string; source_time: string; end_time?: string; why: string; outline?: string };

// How a carousel's slides go, in the carousel skill's formats: one line per slide, so the team sees the deck before it's built.
const OUTLINE = `A carousel outline is 4 to 8 lines, one per slide, each "Slide n, <format>: what's on it". Formats (the
carousel builder's, brain doc "${DOC.carousels}"): email or DM mockup, guest feature (host and guest side by side), quote
over the frame, side-by-side, steps, stat, story, list. Pick the format from what the content is: an email someone
describes is shown as the email, a figure said on the record can be a stat slide. A guest's idea credits the guest, and
there's a "${OWNER}'s take" slide from what ${OWNER} says in the episode. Use the speakers' own words and figures from
the transcript; never invent an email, a figure or a result. A check and cross can mark one good-versus-bad slide; other
lists use plain points.`;

export async function writeOutline(material: string) {
  const system = `You plan carousels in ${OWNER_FULL}'s studio app. ${BRAIN} ${OUTLINE}
Answer with JSON only: {"outline":"Slide 1, cover: ...\\nSlide 2, ..."}`;
  const r = await run(system, material);
  const json = (r.last.match(/\{[\s\S]*\}/) ?? r.text.match(/\{[\s\S]*\}/) ?? ["{}"])[0];
  return { outline: String(JSON.parse(json).outline ?? "").trim(), usage: r.usage };
}

export async function findConcepts(transcript: string, ep: { title: string; guest: string | null; show: string }) {
  const system = `You are the content engine in ${OWNER_FULL}'s studio app. Read the episode transcript and propose the
content worth making from it. ${BRAIN} Use recent_content so you don't repeat a recent angle.
Propose 4 reels, 3 carousels and 3 LinkedIn posts. Reels are moments that stand on their own in under 60 seconds.
Carousels suit things you can show (an email, a checklist, a before and after). Posts suit one idea told well.
For each: kind, a short title, a hook in ${OWNER}'s voice (a number, an outcome and the listener's words; follow the
voice guardrails, no contrast constructions, no em dashes), the timestamp (mm:ss) where the moment starts, and one plain
sentence on why it's worth making for ${OWNER}'s audience. For reels, also the timestamp where the clip should end: where
the point lands and the sentence finishes, 20 to 60 seconds after the start. The transcript only stamps where each
speaker turn begins, so estimate the end from how far into the turn the point finishes (people speak about 2.5 words a
second); the team fine-tunes it in a player. For carousels, also the outline. ${OUTLINE}
Answer with JSON only, exactly this shape and nothing else:
{"concepts":[{"kind":"reel|carousel|post","title":"...","hook":"...","source_time":"mm:ss","end_time":"mm:ss (reels only)","outline":"Slide 1, ...\\nSlide 2, ... (carousels only)","why":"..."}]}`;
  const user = `Episode: ${ep.title}\nShow: ${ep.show}\nGuest: ${ep.guest ?? "none"}\n\nTranscript:\n${transcript}`;
  const r = await run(system, user);
  const json = (r.last.match(/\{[\s\S]*\}/) ?? r.text.match(/\{[\s\S]*\}/) ?? ["{}"])[0];
  const concepts = (JSON.parse(json).concepts ?? []) as Concept[];
  return { concepts: concepts.filter((c) => ["reel", "carousel", "post"].includes(c.kind) && c.title), usage: r.usage };
}
