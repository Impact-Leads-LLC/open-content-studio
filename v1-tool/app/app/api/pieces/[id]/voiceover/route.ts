import { db, storage, safeError } from "../../../../../lib/supabase";
import { actor } from "../../../../../lib/auth";
import { clean, count, saveVo, voPath, voPrefix, voUrl, writeScript, type Vo } from "../../../../../lib/voiceover";
import type { Piece } from "../../../../../lib/pieces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The voiceover on an animated reel (lib/voiceover.ts): the script, the recording's upload link, and the take the owner keeps.
// GET: the voiceover with a link to play the take. POST {action}:
//   script {notes}       Claude writes the script (hook, why it matters, the point, proof, the ask), checked like the coach
//   save {lines}         the script as edited (one line per spoken sentence; the first is the hook)
//   upload {type, name}  a one-time link to upload a take to pieces/<id>/vo/
//   audio {path, seconds} keep that take
//   clear                drop the take to record again
async function load(id: string) {
  const { data, error } = await db().from("studio_pieces").select("*, studio_episodes(title, show, kind)").eq("id", id).single();
  if (error) throw error;
  return data as Piece & { studio_episodes: { title: string; show: string; kind: string | null } };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = await load(id);
    const vo = ((p.media ?? {}) as { vo?: Vo }).vo ?? {};
    return Response.json({ vo, play: await voUrl(vo.audio) });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const who = actor(req)?.name || "Team";
    const p = await load(id);
    if (p.kind !== "reel") return Response.json({ error: "Only a reel takes a voiceover." }, { status: 400 });
    const sb = db();
    const at = new Date().toISOString();
    if (body.action === "script") {
      const { script, usage } = await writeScript(p, p.studio_episodes, typeof body.notes === "string" ? body.notes.slice(0, 2000) : undefined);
      const vo = await saveVo(id, (v) => ({ ...v, script, status: v.audio ? v.status : "script", at, by: who }));
      await sb.from("studio_notes").insert({ piece_id: id, author: "Studio", kind: "note", body: `Wrote the voiceover script (${script.words} words, about ${Math.round(script.words / 2.6)} seconds read aloud).${script.notes ? ` ${script.notes}` : ""}` });
      return Response.json({ vo, usage });
    }
    if (body.action === "save") {
      const lines = clean(body.lines);
      if (lines.length < 2) return Response.json({ error: "The script needs at least a hook and one more line." }, { status: 400 });
      const vo = await saveVo(id, (v) => ({ ...v, script: { ...(v.script ?? { notes: "" }), hook: lines[0], lines, words: count(lines) }, at, by: who }));
      return Response.json({ vo });
    }
    if (body.action === "upload") {
      const type = String(body.type || "audio/webm");
      if (!/^(audio|video)\//.test(type)) return Response.json({ error: "That isn't an audio file." }, { status: 400 });
      const path = voPath(id, type, typeof body.name === "string" ? body.name : undefined);
      const { data, error } = await storage().createSignedUploadUrl(path);
      if (error) throw error;
      return Response.json({ path, signedUrl: data.signedUrl });
    }
    if (body.action === "audio") {
      const path = String(body.path || "");
      if (!path.startsWith(voPrefix(id))) return Response.json({ error: "That take isn't this reel's." }, { status: 400 });
      const seconds = Number.isFinite(Number(body.seconds)) ? Math.round(Number(body.seconds) * 10) / 10 : undefined;
      const vo = await saveVo(id, (v) => ({ ...v, audio: path, seconds, status: "recorded", recorded_at: at, by: who }));
      await sb.from("studio_notes").insert({ piece_id: id, author: who.slice(0, 40), kind: "note", body: `Recorded the voiceover${seconds ? ` (${seconds} s)` : ""}. The reel is made to this take.` });
      return Response.json({ vo, play: await voUrl(path) });
    }
    if (body.action === "clear") {
      const vo = await saveVo(id, (v) => ({ ...v, audio: undefined, seconds: undefined, status: v.script ? "script" : undefined }));
      return Response.json({ vo });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
