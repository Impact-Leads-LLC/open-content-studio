import { COACH } from "./brand";
import { pickTranscript } from "./transcript";
import { db, storage } from "./supabase";
import { writePost, splitPost, revisePost } from "./skill";
import { reviewPiece, revisionMaterial } from "./coach";
import { brainNote, stageNote } from "./stages";
import { ensureSave } from "./platforms";
import { safeError } from "./supabase";
import { makeCard } from "./cards";
import type { Piece } from "./pieces";

type Ep = { title: string; guest: string | null; show: string };

// Write a LinkedIn post with the LinkedIn skill, from the whole transcript. Saved before the coach's first look, so a
// slow look never loses the post; then the first look, before the team sees it (a filter it goes through first, so
// there are fewer suggestions and fewer edits along the way): one review, and one rewrite with its fixes. The coach's
// next review is told what it already asked for. `status` moves the piece along with the first
// save; leave it out to keep the piece where it is.
export async function writePostFor(p: Piece, ep: Ep, status?: string) {
  const sb = db();
  const { data: files } = await storage().list(`episodes/${p.episode_id}`, { limit: 200 });
  const tx = pickTranscript((files ?? []).filter((f) => f.id));
  const transcript = tx ? await (await storage().download(`episodes/${p.episode_id}/${tx.name}`)).data?.text() : "";
  const material = `Episode: ${ep.title} (${ep.show}). Guest: ${ep.guest ?? "none"}.\nConcept #${p.num}: ${p.title}\nHook: ${p.hook}\n${p.why ? `Why it's worth making: ${p.why}\n` : ""}${stageNote(p) ? `${stageNote(p)}\n` : ""}${brainNote(p) ? `${brainNote(p)}\n` : ""}The moment starts at ${p.source_time}.\n\nTranscript:\n${transcript}`;
  const r = await writePost(material);
  const split = splitPost(r.text);
  let { note } = split;
  // the save line before the next step, whether or not the writer kept it (lib/platforms.ts)
  let body = ensureSave(split.body);
  await sb.from("studio_pieces").update({ body, ...(status ? { status } : {}), review: null, updated_at: new Date().toISOString() }).eq("id", p.id);
  let lookError = "";
  const first = await reviewPiece({ ...p, body, status: "draft" }, ep).catch((e) => { lookError = safeError(e); return null; });
  // the coach's first look always leaves a note, so a pass and a failure never look the same
  if (!first) await sb.from("studio_notes").insert({ piece_id: p.id, author: COACH, kind: "note", body: `My first look at the post didn't run (${lookError || "no answer"}), so it's as the writer wrote it. Ask for a review before it goes out.` });
  else if (first.verdict === "ready" || !first.fixes.length) await sb.from("studio_notes").insert({ piece_id: p.id, author: COACH, kind: "note", body: `First look at the post, before the team saw it: ${first.score}/100, ready as written.` });
  if (first && first.verdict !== "ready" && first.fixes.length) {
    const two = splitPost((await revisePost(await revisionMaterial({ ...p, body, review: first }, ""))).text);
    if (two.body.trim()) {
      await sb.from("studio_notes").insert({ piece_id: p.id, author: COACH, kind: "fix", body: `First look, before the team saw it: ${first.score}/100, so the writer made the ${first.fixes.length} fix${first.fixes.length > 1 ? "es" : ""}.`, meta: { review: first, previous: body, first_look: true } });
      body = ensureSave(two.body);
      if (two.note) note = [note, two.note].filter(Boolean).join("\n");
    }
  }
  if (note) await sb.from("studio_notes").insert({ piece_id: p.id, author: "Writer", kind: "note", body: note });
  // every text post comes with its branded graphic, unless someone already gave it an image
  if (!p.media?.image) {
    await makeCard({ ...p, body }, { line: split.card || undefined }).catch((e) => sb.from("studio_notes").insert({ piece_id: p.id, author: "Studio", kind: "note", body: `The post's graphic wasn't made (${safeError(e)}). Use Make the graphic.` }));
  }
  return { body, usage: r.usage };
}
