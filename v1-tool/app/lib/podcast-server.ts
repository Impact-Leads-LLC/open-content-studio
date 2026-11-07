import { createHash } from "node:crypto";
import { db, storage, sign, fileKind } from "./supabase";
import { startJob, renderStatus } from "./render";
import { run } from "./skill";
import { parseTranscript } from "./transcript";
import { BUCKET, type Episode, type Job, type Show } from "./podcast";
import { feedUrlFor } from "./podcast-feed";
import { AUDIENCE, BRAIN_TOOLS, COACH, DOC, OWNER, OWNER_FULL } from "./brand";

// Where the feed lives until the show has its own address (Show.feed_base, set on the podcast page): PODCAST_BASE_URL,
// else the deployment's own production address (Vercel sets VERCEL_PROJECT_PRODUCTION_URL).
export const FALLBACK_BASE = (process.env.PODCAST_BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, "");

export const pstore = () => db().storage.from(BUCKET);
export const fileUrl = (path: string) => pstore().getPublicUrl(path).data.publicUrl;
export const feedUrl = (show: Show) => feedUrlFor(show, FALLBACK_BASE);
// Public links for the page's players and previews.
export const withUrls = (e: Episode) => ({ ...e, audio_url: e.audio_path ? fileUrl(e.audio_path) : null, artwork_url: e.artwork_path ? fileUrl(e.artwork_path) : null, transcript_url: e.transcript_path ? fileUrl(e.transcript_path) : null });

// One show by its feed name; without a name, the first show made.
export async function loadShow(slug?: string) {
  const q = db().from("studio_podcast_shows").select("*").order("created_at").limit(1);
  const { data, error } = await (slug ? q.eq("slug", slug) : q);
  if (error) throw error;
  return (data?.[0] ?? null) as Show | null;
}

export async function listShows() {
  const { data, error } = await db().from("studio_podcast_shows").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []) as Show[];
}

// What a show switcher needs.
export const showCard = (s: Show) => ({ slug: s.slug, title: s.title, artwork_url: s.artwork_path ? fileUrl(s.artwork_path) : null, feed_url: feedUrl(s) });

// Podcasting 2.0's show id: a UUIDv5 of the feed address without its scheme or trailing slash, so every app derives
// the same id from the same feed.
export function podcastGuidFor(feed: string) {
  const h = createHash("sha1").update(Buffer.from("ead4c236bf5858c6a2c6a6b28d128cb6", "hex")).update(feed.replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, "")).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export async function loadEpisodes(showId: string) {
  const { data, error } = await db().from("studio_podcast_episodes").select("*").eq("show_id", showId).order("published_at", { ascending: false, nullsFirst: true });
  if (error) throw error;
  return (data ?? []) as Episode[];
}

export const AUDIO_TYPE: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/x-m4a" };

// Runs on its own cloud machine: download each source, keep a finished MP3/M4A as it is, turn anything else (WAV, a
// video) into a 128 kbps MP3 at -16 LUFS (Apple's loudness), measure it and upload it to the public bucket.
// Each finished file writes a RESULT line, so the app can pick results up while the rest are still going.
const MEDIA_PY = `import json, os, subprocess
S = "/tmp/job/status.txt"
def say(m):
    with open(S, "a") as f: f.write(m + "\\n")
def sh(cmd): return subprocess.run(cmd, check=True, capture_output=True, text=True)
items = json.load(open("/tmp/job/items.json"))
bad = 0
for n, it in enumerate(items, 1):
    src = f"/tmp/job/src-{n}"
    try:
        sh(["curl", "-sSfL", "--retry", "3", it["src"], "-o", src])
        out = src
        if not it["keep"]:
            out = f"/tmp/job/out-{n}.mp3"
            sh(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", out])
        dur = float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).stdout.strip() or 0)
        size = os.path.getsize(out)
        sh(["curl", "-sSf", "-X", "PUT", "-H", "content-type: " + it["type"], "-H", "cache-control: max-age=31536000", "--data-binary", "@" + out, it["out"]])
        say("RESULT " + json.dumps({"key": it["key"], "path": it["path"], "type": it["type"], "bytes": size, "duration": round(dur)}))
    except subprocess.CalledProcessError as e:
        bad += 1
        say("ITEM " + it["key"] + " didn't come through: " + ((e.stderr or "").strip().splitlines() or ["no detail"])[-1][:240])
    for f in {src, out}:
        try: os.remove(f)
        except OSError: pass
say("DONE" if not bad else f"FAILED {bad} of {len(items)} didn't come through")
`;

const MEDIA = `#!/bin/bash
S=/tmp/job/status.txt; : > "$S"
finish() { curl -sS -X PUT -H "content-type: text/plain" -H "x-upsert: true" --data-binary @"$S" "$OUT_LOG" > /dev/null || true; }
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq > /dev/null 2>&1
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg > /dev/null 2>&1 || { echo "FAILED setting up the machine" >> "$S"; finish; exit 1; }
echo "preparing $(python3 -c 'import json;print(len(json.load(open("/tmp/job/items.json"))))') file(s)" >> "$S"
python3 /tmp/job/media.py || echo "FAILED the audio job stopped" >> "$S"
finish
`;

const ext = (name: string) => (name.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1] ?? "").toLowerCase();

// One cloud machine for one or many episodes. `src` is any link the machine can download (a private studio file's
// signed link, or the old host's public link).
export async function startAudio(items: { ep: Pick<Episode, "id" | "slug">; src: string; name: string }[], source: string) {
  if (!items.length) return null;
  const id = `podcast-${Date.now()}`;
  const prepared = await Promise.all(items.map(async ({ ep, src, name }) => {
    const e = ext(name);
    const keep = e === "mp3" || e === "m4a";
    const path = `episodes/${ep.id}/${ep.slug}-${Date.now().toString(36)}.${keep ? e : "mp3"}`;
    const up = await pstore().createSignedUploadUrl(path);
    if (up.error) throw up.error;
    return { key: ep.id, src, keep, path, type: AUDIO_TYPE[keep ? e : "mp3"], out: up.data.signedUrl };
  }));
  const log = await storage().createSignedUploadUrl(`renders/${id}-timings.txt`);
  if (log.error) throw log.error;
  await startJob(id, MEDIA, { OUT_LOG: log.data.signedUrl }, 2, 60, [
    { path: "/tmp/job/items.json", content: JSON.stringify(prepared) },
    { path: "/tmp/job/media.py", content: MEDIA_PY },
  ]);
  const job: Job = { job: id, status: "running", at: new Date().toISOString(), source };
  const { error } = await db().from("studio_podcast_episodes").update({ audio_job: job, updated_at: new Date().toISOString() }).in("id", items.map((i) => i.ep.id));
  if (error) throw error;
  return id;
}

type Result = { key: string; path: string; type: string; bytes: number; duration: number };

// Picks up finished audio. Each episode is written once: the update only matches while its job is still marked running,
// so two open pages can't record the same result twice.
export async function refreshJobs(eps: Episode[]) {
  const running = [...new Set(eps.filter((e) => e.audio_job?.status === "running").map((e) => e.audio_job!.job))];
  if (!running.length) return eps;
  const byId = new Map(eps.map((e) => [e.id, e]));
  await Promise.all(running.map(async (job) => {
    const s = await renderStatus(job);
    const results = s.status.split("\n").filter((l) => l.startsWith("RESULT ")).map((l) => { try { return JSON.parse(l.slice(7)) as Result; } catch { return null; } }).filter(Boolean) as Result[];
    const old = Date.now() - new Date(eps.find((e) => e.audio_job?.job === job)!.audio_job!.at).getTime() > 70 * 60000;
    for (const e of eps.filter((x) => x.audio_job?.job === job)) {
      const r = results.find((x) => x.key === e.id);
      const finished = !!r || s.done || old;
      const audio_job: Job = { ...e.audio_job!, log: s.status.split("\n").filter((l) => l && !l.startsWith("RESULT ")).slice(-3).join("\n") };
      if (!finished) { byId.set(e.id, { ...e, audio_job }); continue; }
      audio_job.status = r ? "ready" : "failed";
      const patch = r ? { audio_path: r.path, audio_bytes: r.bytes, audio_type: r.type, duration: r.duration, audio_job } : { audio_job };
      const { data } = await db().from("studio_podcast_episodes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", e.id).filter("audio_job->>status", "eq", "running").select("*");
      byId.set(e.id, (data?.[0] as Episode) ?? { ...e, ...patch });
    }
  }));
  return eps.map((e) => byId.get(e.id)!);
}

// The studio episode's files a podcast episode can use: audio, the full episode video, transcripts.
export async function studioSources(episodeId: string) {
  const [top, full] = await Promise.all([
    storage().list(`episodes/${episodeId}`, { limit: 200, sortBy: { column: "created_at", order: "desc" } }),
    storage().list(`episodes/${episodeId}/full`, { limit: 20, sortBy: { column: "created_at", order: "desc" } }),
  ]);
  const size = (f: { metadata: unknown }) => (f.metadata as { size?: number } | null)?.size ?? 0;
  const pretty = (n: string) => n.replace(/^\d+-/, "");
  const files = (top.data ?? []).filter((f) => f.id).map((f) => ({ path: `episodes/${episodeId}/${f.name}`, name: pretty(f.name), size: size(f), type: fileKind(f.name) }));
  const fulls = (full.data ?? []).filter((f) => f.id && fileKind(f.name) === "clip").map((f) => ({ path: `episodes/${episodeId}/full/${f.name}`, name: pretty(f.name), size: size(f), type: "full" }));
  return {
    audio: [...files.filter((f) => f.type === "audio"), ...fulls, ...files.filter((f) => f.type === "clip")],
    transcripts: files.filter((f) => f.type === "transcript"),
  };
}

export async function signedSource(path: string) {
  const urls = await sign([path], 4 * 3600);
  if (!urls[path]) throw new Error("That file isn't in the episode's files any more.");
  return urls[path];
}

// The studio episode's transcript as plain lines ("Name: words"), the same file the episode page reads.
export async function studioTranscript(episodeId: string) {
  const { transcripts } = await studioSources(episodeId);
  const tx = transcripts.find((f) => /\.(srt|vtt)$/i.test(f.path)) ?? transcripts[0];
  if (!tx) return "";
  const r = await storage().download(tx.path);
  if (!r.data) return "";
  return parseTranscript(await r.data.text()).lines.map((l) => (l.who ? `${l.who}: ${l.text}` : l.text)).join("\n");
}

const BRAIN = `${BRAIN_TOOLS} Start by calling get_brand_brief. The brain is the authority on voice, audience, offers and
proof. Ideas from a podcast guest belong to the guest: credit them by name and never present their advice as ${OWNER}'s own.`;

// Show notes for one episode, from its transcript.
export async function writeShowNotes(material: string) {
  const system = `You write the show notes for one episode of one of ${OWNER_FULL}'s podcasts (the material names the show). ${BRAIN}
Write two things.
summary: one or two sentences, under 300 characters, that tell ${AUDIENCE} what they get from this episode: a
number, an outcome, the listener's own words. Podcast apps show it first and the website uses it as the teaser.
notes: the rest of the show notes as plain text. Short paragraphs separated by a blank line; a list is lines starting
with "- "; links written out in full. Cover who the guest is (one line, by name), three to five lines on what the
episode covers, where to find the guest if the transcript or brain says so, and one next step taken from the brand
brief. Don't repeat the summary. No timestamps (the published audio can differ from the recording).
The brain's "${DOC.review}" is how ${COACH} reviews: write to pass its checks. Every number and claim comes from the
transcript with its condition and owner. Never invent ${OWNER}'s opinions, stories or experiences. No hashtags, no
emojis, no em dashes. Delivery gate before answering: run the brain's "${DOC.avoidAi}" audit (draft, ask what still reads
as AI, rewrite), then sweep against "${DOC.guardrails}".
Answer with JSON only: {"summary":"...","notes":"...","team_note":"anything the team should check, or empty"}`;
  const r = await run(system, material);
  const json = (r.last.match(/\{[\s\S]*\}/) ?? r.text.match(/\{[\s\S]*\}/) ?? ["{}"])[0];
  const out = JSON.parse(json) as { summary?: string; notes?: string; team_note?: string };
  return { summary: String(out.summary ?? "").trim(), notes: String(out.notes ?? "").trim(), note: String(out.team_note ?? "").trim(), usage: r.usage };
}
