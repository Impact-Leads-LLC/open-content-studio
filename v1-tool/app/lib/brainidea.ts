import { run } from "./skill";
import { BRAIN_RULES, BRAIN_TOOLS, IDEAL_CLIENT, OWNER, OWNER_FULL } from "./brand";

// Fill from the training material: text posts and carousels can use any material the brain holds, whatever the video
// assets, so the calendar stays full. Claude picks one topic the owner teaches that hasn't gone out lately (or the one
// the team asks for) and gathers the owner's own teaching on it from the brain, through the brain connector, as the
// text of an idea. The usual engine then makes its carousels and
// posts (lib/moments.ts MIX.brain: one of each per awareness level, no reels).
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["title", "text", "docs", "why"],
  properties: { title: { type: "string" }, text: { type: "string" }, docs: { type: "array", items: { type: "string" } }, why: { type: "string" } },
};

export async function gatherFromBrain(topic: string) {
  const system = `You gather material for ${OWNER_FULL}'s content studio from ${OWNER}'s training material in the brain.
${BRAIN_TOOLS} The brain is the authority on ${OWNER}'s lane, ideal client, IP, offers and voice. Call get_brand_brief
first, then recent_content to see what has gone out lately, then brain_search.
${topic ? `The team asked for this topic: "${topic}". Find what ${OWNER} teaches on it.` : `Pick one topic ${OWNER} teaches that hasn't gone out in the last month: a framework, a method, a mistake ${OWNER}'s
clients make and its fix, or a client result and its lesson, that speaks to the ideal client (${IDEAL_CLIENT}).`}
Then gather the source the studio will make carousels and posts from: ${OWNER}'s own teaching on that topic, from
${OWNER}'s own material (courses, trainings, workshops, their own podcast and posts) and client results, kept close to
how ${OWNER} says it, in plain paragraphs, 600 to 1,500 words. ${BRAIN_RULES} A confidential document's lesson may be
said in your own plain words, never quoted. Never invent
anything: when the brain has little on the topic, say so in why and return what there is.
title: the topic as a short plain title that says what the reader gets. text: the material. docs: the titles of the
documents it comes from. why: one plain sentence for the team on why this topic now. Answer with the JSON only.`;
  const r = await run(system, topic ? `Gather the material on: ${topic}` : "Pick the topic and gather the material.", SCHEMA);
  const m = (r.last.match(/\{[\s\S]*\}/) ?? r.text.match(/\{[\s\S]*\}/))?.[0];
  if (!m) throw new Error("Nothing came back from the training material. Try again.");
  const out = JSON.parse(m) as { title?: string; text?: string; docs?: string[]; why?: string };
  const title = String(out.title ?? "").trim(), text = String(out.text ?? "").trim();
  if (!title || text.split(/\s+/).length < 150) throw new RangeError(`The brain had too little on ${topic ? `"${topic}"` : "a fresh topic"} to make pieces from.${out.why ? ` ${out.why}` : ""}`);
  return { title, text, docs: (out.docs ?? []).map(String).filter(Boolean).slice(0, 12), why: String(out.why ?? "").trim(), usage: r.usage };
}
