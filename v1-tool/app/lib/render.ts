import { Sandbox } from "@vercel/sandbox";
import { storage } from "./supabase";
import { engineEnv } from "./brain";
import { OWNER, studioContext } from "./brand";

// Runs on the cloud machine: unpack the editor (stack-engine, uploaded as uploads/<ts>-stack-engine.tgz) and hand over
// to its run.sh, which transcribes the clip, has Claude plan the edit, cuts, builds and renders it, and uploads the reel.
const EDIT = `#!/bin/bash
S=/tmp/job/status.txt
cd /tmp/job && curl -sSfL "$ENGINE_URL" -o engine.tgz && tar xzf engine.tgz || {
  echo "FAILED at download (editor)" > "$S"; curl -sS -X PUT -H "content-type: text/plain" -H "x-upsert: true" --data-binary @"$S" "$OUT_LOG" > /dev/null; exit 1; }
exec bash /tmp/job/stack-engine/run.sh
`;

// Cuts one clip out of the full episode. ffmpeg seeks inside the stored file over HTTP, so only the minutes it needs
// are read, and re-encoding makes the cut land on the exact frame instead of the nearest keyframe.
const CUT = `#!/bin/bash
set -uo pipefail
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq > /dev/null 2>&1
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg > /dev/null 2>&1 || { echo "FAILED couldn't set up the cutting machine"; exit 1; }
cd /tmp
ffmpeg -v error -y -ss "$START" -i "$SRC_URL" -t "$LEN" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart cut.mp4 || { echo "FAILED ffmpeg couldn't cut the clip"; exit 1; }
DIMS=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 cut.mp4)
curl -sSf -X PUT -H "content-type: video/mp4" --data-binary @cut.mp4 "$OUT_URL" > /dev/null || { echo "FAILED couldn't save the clip"; exit 1; }
echo "DONE $DIMS"
`;

// One frame of a video as a JPEG (the cover at 0.5 s for a reel rendered before covers existed, or a full episode's
// YouTube thumbnail). ffmpeg seeks inside the stored file over HTTP, so only the first seconds are read.
const FRAME = `#!/bin/bash
set -uo pipefail
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq > /dev/null 2>&1
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg > /dev/null 2>&1 || { echo "FAILED couldn't set up the machine"; exit 1; }
cd /tmp && ffmpeg -v error -y -ss "$AT" -i "$SRC_URL" -frames:v 1 -q:v 2 frame.jpg || { echo "FAILED couldn't grab the frame"; exit 1; }
curl -sSf -X PUT -H "content-type: image/jpeg" -H "x-upsert: true" --data-binary @frame.jpg "$OUT_URL" > /dev/null || { echo "FAILED couldn't save the frame"; exit 1; }
echo "DONE"
`;

export async function frameAt(video: string, at: number, out: string) {
  const [src, dst] = await Promise.all([storage().createSignedUrl(video, 3600), storage().createSignedUploadUrl(out, { upsert: true })]);
  if (src.error || dst.error) throw src.error ?? dst.error;
  const sandbox = await Sandbox.create({ name: `frame-${Date.now()}`, resources: { vcpus: 2 }, timeout: 10 * 60 * 1000, persistent: false });
  try {
    await sandbox.writeFiles([{ path: "/tmp/frame.sh", content: FRAME, mode: 0o755 }]);
    const r = await sandbox.runCommand({ cmd: "bash", args: ["/tmp/frame.sh"], env: { SRC_URL: src.data!.signedUrl, OUT_URL: dst.data!.signedUrl, AT: String(at) } });
    const last = (await r.stdout()).trim().split("\n").pop() ?? "";
    if (r.exitCode !== 0 || last !== "DONE") throw new Error(last.replace(/^FAILED\s*/, "") || "The frame didn't come out.");
    return out;
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

export async function cutClip(source: string, out: string, start: number, length: number) {
  const [src, dst] = await Promise.all([storage().createSignedUrl(source, 3600), storage().createSignedUploadUrl(out)]);
  if (src.error || dst.error) throw src.error ?? dst.error;
  const sandbox = await Sandbox.create({ name: `cut-${Date.now()}`, resources: { vcpus: 4 }, timeout: 10 * 60 * 1000, persistent: false });
  try {
    await sandbox.writeFiles([{ path: "/tmp/cut.sh", content: CUT, mode: 0o755 }]);
    const r = await sandbox.runCommand({ cmd: "bash", args: ["/tmp/cut.sh"], env: { SRC_URL: src.data!.signedUrl, OUT_URL: dst.data!.signedUrl, START: start.toFixed(2), LEN: length.toFixed(2) } });
    const last = (await r.stdout()).trim().split("\n").pop() ?? "";
    if (r.exitCode !== 0 || !last.startsWith("DONE")) throw new Error(last.replace(/^FAILED\s*/, "") || "The cut didn't finish. Try again.");
    const [w, h] = (last.split(" ")[1] ?? "").split("x").map(Number);
    return { width: w || 0, height: h || 0 };
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

// The 9:16 stack from the camera feeds: the guest on top, the host underneath, each camera centre-cropped to fill its half
// (one camera fills the whole frame), both voices mixed. Inputs: GV/GA (top camera and its own audio file, if any),
// HV/HA (bottom), START and LEN (empty for the whole episode), SW (output width), FPS, ENC (encoder flags), LOUD (1 to
// level the voices for social).
const STACK_FN = `
stack() {
  local out="$1" seek=() args=() vids=() auds=() n=0 who=0
  [ -n "\${START:-}" ] && seek=(-ss "$START"); [ -n "\${LEN:-}" ] && seek+=(-t "$LEN")
  for v in "\${GV:-}" "\${HV:-}"; do [ -n "$v" ] && { args+=("\${seek[@]}" -i "$v"); vids+=("$n"); n=$((n+1)); }; done
  # each person's voice: their own audio file, or the sound inside their camera file
  for pair in "\${GA:-}|\${GV:-}" "\${HA:-}|\${HV:-}"; do
    local a="\${pair%%|*}" v="\${pair##*|}"
    if [ -n "$a" ]; then args+=("\${seek[@]}" -i "$a"); auds+=("$n:a:0"); n=$((n+1))
    elif [ -n "$v" ] && [ -n "$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$v" 2>/dev/null)" ]; then auds+=("\${vids[$who]}:a:0"); fi
    [ -n "$v" ] && who=$((who+1))
  done
  local H=$((SW * 16 / 9)) HALF=$((SW * 8 / 9)) vf af map=()
  if [ "\${#vids[@]}" -ge 2 ]; then
    vf="[0:v]crop='min(iw,ih*9/8)':'min(ih,iw*8/9)',scale=$SW:$HALF,setsar=1[t];[1:v]crop='min(iw,ih*9/8)':'min(ih,iw*8/9)',scale=$SW:$HALF,setsar=1[b];[t][b]vstack=inputs=2,fps=$FPS,format=yuv420p[v]"
  else
    vf="[0:v]crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=$SW:$H,setsar=1,fps=$FPS,format=yuv420p[v]"
  fi
  local lev=""; [ "\${LOUD:-}" = 1 ] && lev=",loudnorm=I=-14:TP=-1.5:LRA=11"
  if [ "\${#auds[@]}" -ge 2 ]; then af=";[\${auds[0]}][\${auds[1]}]amix=inputs=2:normalize=0:duration=shortest$lev,aresample=48000[a]"; map=(-map "[a]")
  elif [ "\${#auds[@]}" -eq 1 ]; then af=";[\${auds[0]}]anull$lev,aresample=48000[a]"; map=(-map "[a]")
  else af=""; map=(-an); fi
  echo "stack: \${#vids[@]} camera(s), \${#auds[@]} voice(s)"
  ffmpeg -v error -y "\${args[@]}" -filter_complex "$vf$af" -map "[v]" "\${map[@]}" $ENC -shortest -movflags +faststart "$out"
}
`;

const SETUP = `sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq > /dev/null 2>&1
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg > /dev/null 2>&1`;

// The whole episode stacked small (540x960), so the trim player shows exactly what the reel will look like.
const STACK_PREVIEW = `#!/bin/bash
set -uo pipefail
S=/tmp/job/status.txt; : > "$S"; T0=$(date +%s)
finish() { echo "$1 (total $(( $(date +%s) - T0 )) s)" >> "$S"; curl -sS -X PUT -H "content-type: text/plain" -H "x-upsert: true" --data-binary @"$S" "$OUT_LOG" > /dev/null || true; }
${SETUP} || { finish "FAILED setting up the machine"; exit 1; }
echo "stacking the whole episode" >> "$S"
${STACK_FN}
cd /tmp/job && SW=540 FPS=24 ENC="-c:v libx264 -preset veryfast -crf 31 -c:a aac -b:a 96k" stack preview.mp4 >> "$S" 2>&1 || { finish "FAILED stacking"; exit 1; }
curl -sSf -X PUT -H "content-type: video/mp4" --data-binary @preview.mp4 "$OUT" > /dev/null || { finish "FAILED saving"; exit 1; }
echo "preview: $(du -m preview.mp4 | cut -f1) MB" >> "$S"
finish "DONE"
`;

// One reel's clip, cut from every camera and microphone at full quality and stacked.
const STACK_CUT = `#!/bin/bash
set -uo pipefail
${SETUP} || { echo "FAILED couldn't set up the cutting machine"; exit 1; }
${STACK_FN}
cd /tmp
SW=1080 FPS=30 LOUD=1 ENC="-c:v libx264 -preset veryfast -crf 18 -c:a aac -b:a 192k" stack cut.mp4 || { echo "FAILED ffmpeg couldn't stack the clip"; exit 1; }
DIMS=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 cut.mp4)
curl -sSf -X PUT -H "content-type: video/mp4" --data-binary @cut.mp4 "$OUT_URL" > /dev/null || { echo "FAILED couldn't save the clip"; exit 1; }
echo "DONE $DIMS"
`;

export type StackInput = { top?: { video: string; audio?: string }; bottom?: { video: string; audio?: string } };

async function stackEnv(inp: StackInput, secs: number) {
  const paths = [inp.top?.video, inp.top?.audio, inp.bottom?.video, inp.bottom?.audio];
  const signed = await Promise.all(paths.map((p) => (p ? storage().createSignedUrl(p, secs) : Promise.resolve(null))));
  const err = signed.find((s) => s?.error)?.error;
  if (err) throw err;
  const [GV, GA, HV, HA] = signed.map((s) => s?.data?.signedUrl ?? "");
  return { GV, GA, HV, HA };
}

export async function stackClip(inp: StackInput, out: string, start: number, length: number) {
  const [env, dst] = await Promise.all([stackEnv(inp, 3600), storage().createSignedUploadUrl(out)]);
  if (dst.error) throw dst.error;
  const sandbox = await Sandbox.create({ name: `cut-${Date.now()}`, resources: { vcpus: 4 }, timeout: 10 * 60 * 1000, persistent: false });
  try {
    await sandbox.writeFiles([{ path: "/tmp/cut.sh", content: STACK_CUT, mode: 0o755 }]);
    const r = await sandbox.runCommand({ cmd: "bash", args: ["/tmp/cut.sh"], env: { ...env, OUT_URL: dst.data!.signedUrl, START: start.toFixed(2), LEN: length.toFixed(2) } });
    const last = (await r.stdout()).trim().split("\n").pop() ?? "";
    if (r.exitCode !== 0 || !last.startsWith("DONE")) throw new Error(last.replace(/^FAILED\s*/, "") || "The cut didn't finish. Try again.");
    const [w, h] = (last.split(" ")[1] ?? "").split("x").map(Number);
    return { width: w || 0, height: h || 0 };
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

export async function startStackPreview(inp: StackInput, out: string) {
  const id = `stack-${Date.now()}`;
  const [env, dst, log] = await Promise.all([stackEnv(inp, 4 * 3600), storage().createSignedUploadUrl(out, { upsert: true }), storage().createSignedUploadUrl(`renders/${id}-timings.txt`)]);
  if (dst.error || log.error) throw dst.error ?? log.error;
  await startJob(id, STACK_PREVIEW, { ...env, OUT: dst.data!.signedUrl, OUT_LOG: log.data!.signedUrl }, 8, 60);
  return id;
}

// A script that runs detached on its own cloud machine; jobStatus() reads its status file while it runs.
export async function startJob(id: string, script: string, env: Record<string, string>, vcpus = 8, minutes = 90, files: { path: string; content: string }[] = []) {
  const sandbox = await Sandbox.create({ name: id, resources: { vcpus }, timeout: minutes * 60 * 1000, persistent: false });
  await sandbox.mkDir("/tmp/job");
  await sandbox.writeFiles([{ path: "/tmp/job/job.sh", content: script, mode: 0o755 }, ...files]);
  await sandbox.runCommand({ cmd: "bash", args: ["/tmp/job/job.sh"], env, detached: true });
}

// Runs on the cloud machine: unpack the carousel builder (uploads/<ts>-carousel-engine.tgz, the carousel skill inside)
// and hand over to its run.sh, which plans the deck, pulls stills, writes and renders the slides, checks them, uploads.
const CAROUSEL = `#!/bin/bash
S=/tmp/job/status.txt
cd /tmp/job && curl -sSfL "$ENGINE_URL" -o engine.tgz && tar xzf engine.tgz || {
  echo "FAILED at download (builder)" > "$S"; curl -sS -X PUT -H "content-type: text/plain" -H "x-upsert: true" --data-binary @"$S" "$OUT_LOG" > /dev/null; exit 1; }
exec bash /tmp/job/carousel-engine/run.sh
`;

export const isDeck = (id?: string) => !!id?.startsWith("carousel-");
export const deckSlide = (id: string, n: number) => `renders/${id}/slide-${String(n).padStart(2, "0")}.png`;
export const deckSheet = (id: string) => `renders/${id}/contact-sheet.png`;
export const deckPlan = (id: string) => `renders/${id}/deck.json`;

export type CarouselContext = {
  episode: { title: string; guest: string | null; show: string };
  // awareness: the level the piece is built for (lib/stages.ts), so the copy is pitched to that reader
  // brain: the training-material documents it's built out with (lib/moments.ts)
  piece: { num: number; title: string; hook: string | null; why: string | null; outline: string | null; caption: string | null; awareness?: string | null; insight?: string | null; brain?: string[] };
  // the team's notes for this build (small changes, or the coach's fixes)
  notes?: string;
  // the episode transcript around the idea, on the episode clock (seconds): the source for every word and figure
  script?: { at: number; who: string; text: string }[];
  top?: string; bottom?: string;
};

// Up to 10 slides come back, each to its own upload link; the deck file says how many there are (10 is the most the
// scheduler posts: Instagram's API takes 10 images a carousel). The camera feeds go as private links so the builder can
// pull stills from them without downloading the whole episode.
export const MAX_SLIDES = 10;
export async function startCarousel(engine: string, context: CarouselContext, feeds: { top?: string; bottom?: string }) {
  const sb = storage();
  const id = `carousel-${Date.now()}`;
  const [e, log, sheet, plan, top, bottom, ...slides] = await Promise.all([
    sb.createSignedUrl(engine, 7200),
    sb.createSignedUploadUrl(`renders/${id}-timings.txt`),
    sb.createSignedUploadUrl(deckSheet(id)),
    sb.createSignedUploadUrl(deckPlan(id)),
    feeds.top ? sb.createSignedUrl(feeds.top, 7200) : Promise.resolve(null),
    feeds.bottom ? sb.createSignedUrl(feeds.bottom, 7200) : Promise.resolve(null),
    ...Array.from({ length: MAX_SLIDES }, (_, i) => sb.createSignedUploadUrl(deckSlide(id, i + 1))),
  ]);
  const err = e.error || log.error || sheet.error || plan.error || top?.error || bottom?.error || slides.find((s) => s.error)?.error;
  if (err) throw err;
  const env: Record<string, string> = {
    ENGINE_URL: e.data!.signedUrl, OUT_LOG: log.data!.signedUrl, OUT_SHEET: sheet.data!.signedUrl, OUT_PLAN: plan.data!.signedUrl,
    TOP_URL: top?.data?.signedUrl ?? "", BOTTOM_URL: bottom?.data?.signedUrl ?? "",
    ...engineEnv(),
    // a generated cover picture when the deck has no episode still (carousel-engine 2b); optional
    FAL_KEY: (process.env.FAL_KEY || process.env.FAL_API_KEY || "").trim(), FAL_IMAGE_MODEL: process.env.FAL_IMAGE_MODEL ?? "",
  };
  slides.forEach((s, i) => { env[`OUT_SLIDE_${i + 1}`] = s.data!.signedUrl; });
  const sandbox = await Sandbox.create({ name: id, resources: { vcpus: 4 }, timeout: 45 * 60 * 1000, persistent: false });
  await sandbox.mkDir("/tmp/job");
  await sandbox.writeFiles([
    { path: "/tmp/job/job.sh", content: CAROUSEL, mode: 0o755 },
    { path: "/tmp/job/context.json", content: JSON.stringify({ ...context, studio: studioContext() }) },
  ]);
  await sandbox.runCommand({ cmd: "bash", args: ["/tmp/job/job.sh"], env, detached: true });
  return id;
}

// Transcribes raw footage when there's no transcript. With Riverside's separate tracks each person is transcribed from
// their own track, so every line carries the right name; one file comes out as "Speaker". HyperFrames' Parakeet model
// runs on the cloud machine (it has no compiler for whisper.cpp); the result is written in Riverside's .txt shape, so
// the rest of the app reads it like any transcript.
const TRANSCRIBE = `#!/bin/bash
set -uo pipefail
S=/tmp/job/status.txt; : > "$S"; T0=$(date +%s)
finish() { echo "$1 (total $(( $(date +%s) - T0 )) s)" >> "$S"; curl -sS -X PUT -H "content-type: text/plain" -H "x-upsert: true" --data-binary @"$S" "$OUT_LOG" > /dev/null || true; }
${SETUP} || { finish "FAILED setting up the machine"; exit 1; }
cd /tmp/job && npm i --silent --no-audit --no-fund hyperframes@0.8.143 > hf.log 2>&1 && "$HF" models install parakeet >> hf.log 2>&1 || { tail -3 hf.log >> "$S"; finish "FAILED setting up speech to text"; exit 1; }
echo "speech model ready" >> "$S"
python3 transcribe.py >> "$S" 2>> py.log || { NOS=$(grep -E '^No (sound|speech)' "$S" | tail -1); [ -n "$NOS" ] && { finish "FAILED: $NOS"; exit 1; }; tail -4 py.log | sed -E 's/(token|sig)=[^& ]+/\\1=[...]/g' >> "$S"; finish "FAILED transcribing"; exit 1; }
curl -sSf -X PUT -H "content-type: text/plain; charset=utf-8" --data-binary @transcript.txt "$OUT" > /dev/null || { finish "FAILED saving the transcript"; exit 1; }
[ -n "\${OUT_WORDS:-}" ] && curl -sS -X PUT -H "content-type: application/json" --data-binary @words.json "$OUT_WORDS" > /dev/null || true
finish "DONE"
`;

const TRANSCRIBE_PY = `import json, os, re, subprocess
HF = os.environ["HF"]
sources = json.loads(os.environ["SOURCES"])   # [{"who": "Sam Rivera", "name": "sam.wav", "url": "..."}]
PART = 90.0                                    # seconds per piece, cut in a pause

def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True)

def pieces(wav, dur):
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav, "-af", "highpass=f=80,silencedetect=noise=-40dB:d=0.4", "-f", "null", "-"], capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\\d.]+)", log)]
    cuts = [(s + e) / 2 for s, e in zip(starts, ends)]
    out, a = [], 0.0
    while a < dur - 0.5:
        if a + PART >= dur:
            out.append((a, dur)); break
        near = [c for c in cuts if a + 30 < c <= a + PART]
        b = near[-1] if near else a + PART
        out.append((a, b)); a = b
    return out

words, silent = [], []
for i, src in enumerate(sources):
    # a file with no sound (a screen share, or a camera file whose voice is only in the microphone file) is skipped
    if not run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", src["url"]]).stdout.strip():
        silent.append(src["name"])
        print(f"{src['who']}: no sound in {src['name']}, skipped", flush=True)
        continue
    wav = f"src{i}.wav"
    run(["ffmpeg", "-v", "error", "-y", "-i", src["url"], "-vn", "-ac", "1", "-ar", "16000", wav])
    dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).stdout)
    parts = pieces(wav, dur)
    print(f"{src['who']}: {dur / 60:.1f} min in {len(parts)} parts", flush=True)
    for k, (a, b) in enumerate(parts):
        part = f"p{i}_{k:03d}.wav"
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", wav, part])
        r = run([HF, "transcribe", part, "--dir", f"d{i}_{k:03d}", "--json", "-l", "en"])
        info = json.loads(r.stdout.strip().splitlines()[-1])
        data = json.load(open(info["transcriptPath"]))
        for w in data if isinstance(data, list) else data.get("words", []):
            t = (w.get("text") or w.get("word") or "").strip()
            if t:
                words.append({"who": src["who"], "text": t, "start": a + float(w["start"]), "end": a + float(w["end"])})
    print(f"{src['who']}: done", flush=True)
if not words:
    print(f"No sound in {', '.join(silent)}" if silent else "No speech found", flush=True)
    raise SystemExit(3)

# every word with its time and speaker, for the full episode's captions (the episode engine reads it)
json.dump(sorted(words, key=lambda w: w["start"]), open("words.json", "w"))

# Turns. Each person's own track gives clean runs (words under 1.2 s apart, at most 45 s), so talking over each other
# doesn't chop a sentence into single words. The runs go in time order and back-to-back runs from one person join up.
def stamp(t):
    m, s = divmod(t, 60)
    h, m = divmod(int(m), 60)
    return f"{h}:{m:02d}:{s:06.3f}" if h else f"{m:02d}:{s:06.3f}"
runs = []
for who in dict.fromkeys(w["who"] for w in words):
    cur = None
    for w in sorted((x for x in words if x["who"] == who), key=lambda x: x["start"]):
        if cur and w["start"] - cur["end"] < 1.2 and w["start"] - cur["start"] < 45:
            cur["words"].append(w); cur["end"] = w["end"]
        else:
            if cur: runs.append(cur)
            cur = {"who": who, "start": w["start"], "end": w["end"], "words": [w]}
    if cur: runs.append(cur)
runs.sort(key=lambda r: r["start"])
blocks = []
for r in runs:
    b = blocks[-1] if blocks else None
    if b and b["who"] == r["who"] and r["start"] - b["end"] < 2.5 and r["start"] - b["start"] < 45:
        b["words"] += r["words"]; b["end"] = r["end"]
    else:
        blocks.append(r)
# One line per sentence, stamped with the time its first word starts (a long sentence breaks every 12 s or so), so a
# moment's start and end land on the words instead of a guess spread across a long answer.
lines = []
for b in blocks:
    cur = None
    for w in b["words"]:
        if cur is None or (re.search(r"[.?!]$", cur["words"][-1]["text"]) and w["start"] - cur["start"] >= 2.5) or w["start"] - cur["start"] >= 12:
            cur = {"who": b["who"], "start": w["start"], "words": []}
            lines.append(cur)
        cur["words"].append(w)
lines.sort(key=lambda l: l["start"])   # when they talk over each other, the lines interleave in time order
with open("transcript.txt", "w") as f:
    for l in lines:
        f.write(f"{l['who']} ({stamp(l['start'])})\\n{' '.join(w['text'] for w in l['words'])}\\n\\n")
print(f"transcript: {len(words)} words, {len(blocks)} turns, {len(lines)} lines", flush=True)
`;

// words: where every word's time goes too (episodes/<id>/words/<ts>.json), for the full episode's captions
export async function startTranscribe(sources: { who: string; path: string }[], out: string, words?: string) {
  const id = `transcribe-${Date.now()}`;
  const [urls, dst, log, wd] = await Promise.all([
    Promise.all(sources.map((s) => storage().createSignedUrl(s.path, 4 * 3600))),
    storage().createSignedUploadUrl(out),
    storage().createSignedUploadUrl(`renders/${id}-timings.txt`),
    words ? storage().createSignedUploadUrl(words) : Promise.resolve(null),
  ]);
  const err = urls.find((u) => u.error)?.error || dst.error || log.error || wd?.error;
  if (err) throw err;
  const env = {
    SOURCES: JSON.stringify(sources.map((s, i) => ({ who: s.who, name: s.path.split("/").pop()!.replace(/^\d+-/, ""), url: urls[i].data!.signedUrl }))),
    OUT: dst.data!.signedUrl, OUT_LOG: log.data!.signedUrl, HF: "/tmp/job/node_modules/.bin/hyperframes", OUT_WORDS: wd?.data?.signedUrl ?? "",
  };
  await startJob(id, TRANSCRIBE, env, 8, 120, [{ path: "/tmp/job/transcribe.py", content: TRANSCRIBE_PY }]);
  return id;
}

// The produced full episode, on a cloud machine with the episode engine (uploads/<ts>-episode-engine.tgz, the newest
// wins, so a new version goes live by uploading it): the camera follows whoever is talking with slow pushes, a cold open,
// title, name, chapter and end cards, a graphic every two or three minutes, punch-ins, word-by-word captions, levelled
// sound, on every episode without asking. Its run.sh does the steps; the result goes into the episode's
// full/ folder, so the podcast, ContentStudio and the Drive copy all use it.
const PRODUCE = `#!/bin/bash
S=/tmp/job/status.txt
cd /tmp/job && curl -sSfL "$ENGINE_URL" -o engine.tgz && tar xzf engine.tgz || {
  echo "FAILED at download (editor)" > "$S"; curl -sS -X PUT -H "content-type: text/plain" -H "x-upsert: true" --data-binary @"$S" "$OUT_LOG" > /dev/null; exit 1; }
exec bash /tmp/job/episode-engine/run.sh
`;

export const shotsPath = (id: string) => `renders/${id}-shots.json`;

// What the produced episode leaves next to the video: the editor's plan, the captions, the YouTube chapters, a frame
// sheet of the animated moments.
export const episodeOut = (job: string) => ({ plan: `renders/${job}-plan.json`, srt: `renders/${job}-captions.srt`, chapters: `renders/${job}-chapters.txt`, sheet: `renders/${job}-sheet.jpg` });

export type EpisodeContext = { episode: { title: string; guest: string | null; show: string }; guest_site?: string; notes?: string; rules?: string[] };

// start/end: seconds on the recording's clock; left out, the edit runs from just before the first word to just after
// the last. names: who's on each camera. words: the transcription's word times, if saved (else the machine transcribes).
export async function startFullEdit(inp: StackInput, names: { top?: string; bottom?: string }, out: string,
  opts: { start?: number; end?: number; engine: string; words?: string; broll?: { path: string; offset: number }[]; ad?: string; context: EpisodeContext }) {
  const id = `fulledit-${Date.now()}`;
  const o = episodeOut(id);
  const sb = storage();
  const [env, e, w, dst, log, shots, plan, srt, chapters, sheet] = await Promise.all([
    stackEnv(inp, 6 * 3600),
    sb.createSignedUrl(opts.engine, 6 * 3600),
    opts.words ? sb.createSignedUrl(opts.words, 6 * 3600) : Promise.resolve(null),
    sb.createSignedUploadUrl(out),
    sb.createSignedUploadUrl(`renders/${id}-timings.txt`),
    sb.createSignedUploadUrl(shotsPath(id), { upsert: true }),
    sb.createSignedUploadUrl(o.plan, { upsert: true }),
    sb.createSignedUploadUrl(o.srt, { upsert: true }),
    sb.createSignedUploadUrl(o.chapters, { upsert: true }),
    sb.createSignedUploadUrl(o.sheet, { upsert: true }),
  ]);
  const err = e.error || w?.error || dst.error || log.error || shots.error || plan.error || srt.error || chapters.error || sheet.error;
  if (err) throw err;
  // the screen shares and the show's ad read, as private links the machine downloads
  const [br, ad] = await Promise.all([
    Promise.all((opts.broll ?? []).map((b) => sb.createSignedUrl(b.path, 6 * 3600).then((r) => (r.data ? { url: r.data.signedUrl, offset: b.offset } : null)))),
    opts.ad ? sb.createSignedUrl(opts.ad, 6 * 3600) : Promise.resolve(null),
  ]);
  await startJob(id, PRODUCE, {
    TOP_V: env.GV, TOP_A: env.GA, BOT_V: env.HV, BOT_A: env.HA, TOP_NAME: names.top ?? "", BOT_NAME: names.bottom ?? "",
    START: opts.start != null ? opts.start.toFixed(2) : "", END: opts.end != null ? opts.end.toFixed(2) : "",
    ENGINE_URL: e.data!.signedUrl, WORDS_URL: w?.data?.signedUrl ?? "", AD_URL: ad?.data?.signedUrl ?? "",
    BROLL: JSON.stringify(br.filter(Boolean)),
    OUT: dst.data!.signedUrl, OUT_LOG: log.data!.signedUrl, OUT_SHOTS: shots.data!.signedUrl, OUT_PLAN: plan.data!.signedUrl,
    OUT_SRT: srt.data!.signedUrl, OUT_CHAPTERS: chapters.data!.signedUrl, OUT_SHEET: sheet.data!.signedUrl,
    ...engineEnv(),
  }, 8, 180, [{ path: "/tmp/job/context.json", content: JSON.stringify({ ...opts.context, studio: studioContext() }) }]);
  return id;
}

export const renderPath = (id: string) => `renders/${id}.mp4`;
// the cover every network shows: the frame half a second in
export const coverPath = (id: string) => `renders/${id}-cover.jpg`;
export const sheetPath = (id: string) => `renders/${id}-sheet.jpg`;
export const planPath = (id: string) => `renders/${id}-plan.json`;

// What the editor knows about the clip. layout: "stack" for clips cut from the camera feeds (guest on top, the host
// underneath), "single" for one 9:16 frame such as a Riverside Magic Clip.
export type EditContext = {
  layout: "stack" | "single";
  episode: { title: string; guest: string | null; show: string };
  piece: { num: number; title: string; hook: string | null; caption: string | null };
  top?: string; bottom?: string; show: string; duration?: number;
  // who speaks when, in clip seconds: each graphic goes in the half of the person whose words it shows
  turns?: { at: number; side: "top" | "bottom"; who: string }[];
  // the episode transcript's lines inside the clip (clip seconds): the reference for wording and numbers, since the
  // cloud's speech-to-text can mishear (a "$10,000" heard as "$1,000")
  script?: { at: number; who: string; text: string }[];
  // the team's notes for this reel's edit (small changes, or the coach's fixes)
  notes?: string;
};

// The Claude key and the brain connector token go to the machine for the edit plan only; run.sh never prints them.
export async function startEdit(clip: string, engine: string, context: EditContext) {
  const sb = storage();
  const id = `render-${Date.now()}`;
  const [c, e, mp4, log, sheet, plan, cover] = await Promise.all([
    sb.createSignedUrl(clip, 7200),
    sb.createSignedUrl(engine, 7200),
    sb.createSignedUploadUrl(renderPath(id)),
    sb.createSignedUploadUrl(`renders/${id}-timings.txt`),
    sb.createSignedUploadUrl(sheetPath(id)),
    sb.createSignedUploadUrl(planPath(id)),
    sb.createSignedUploadUrl(coverPath(id)),
  ]);
  const err = c.error || e.error || mp4.error || log.error || sheet.error || plan.error || cover.error;
  if (err) throw err;
  const env = {
    CLIP_URL: c.data!.signedUrl, ENGINE_URL: e.data!.signedUrl, OUT_MP4: mp4.data!.signedUrl, OUT_LOG: log.data!.signedUrl,
    OUT_SHEET: sheet.data!.signedUrl, OUT_PLAN: plan.data!.signedUrl, OUT_COVER: cover.data!.signedUrl,
    ...engineEnv(),
  };
  const sandbox = await Sandbox.create({ name: id, resources: { vcpus: 8 }, timeout: 90 * 60 * 1000, persistent: false });
  await sandbox.mkDir("/tmp/job");
  await sandbox.writeFiles([
    { path: "/tmp/job/job.sh", content: EDIT, mode: 0o755 },
    { path: "/tmp/job/context.json", content: JSON.stringify({ ...context, studio: studioContext() }) },
  ]);
  await sandbox.runCommand({ cmd: "bash", args: ["/tmp/job/job.sh"], env, detached: true });
  return id;
}

// How long each kind of job's machine may run (the timeouts given to Sandbox.create above), by its id's prefix.
const LIMIT_MIN: Record<string, number> = { render: 90, carousel: 45, stack: 60, transcribe: 120, fulledit: 180, animated: 45, thumb: 30, podcast: 60 };
// A job whose machine is gone and never saved its log: once its time limit is long past, it ran out of time or was
// shut down. Reporting it failed brings the retry buttons back instead of showing it running forever.
function lostJob(id: string) {
  const m = id.match(/^([a-z]+)-(\d{12,})/);
  if (!m) return false;
  return Date.now() - Number(m[2]) > ((LIMIT_MIN[m[1]] ?? 180) + 10) * 60000;
}

// Live status from the machine while it runs; the uploaded timings file once it has stopped.
export async function renderStatus(id: string): Promise<{ status: string; done: boolean; ok: boolean }> {
  try {
    const sandbox = await Sandbox.get({ name: id });
    const status = (await sandbox.readFileToBuffer({ path: "/tmp/job/status.txt" }))?.toString() ?? "";
    const done = /^(DONE|FAILED)/m.test(status);
    if (done) await sandbox.stop().catch(() => {});
    return { status, done, ok: /^DONE/m.test(status) };
  } catch {
    const log = await storage().download(`renders/${id}-timings.txt`);
    if (log.data) {
      const status = await log.data.text();
      return { status, done: true, ok: /^DONE/m.test(status) };
    }
    if (lostJob(id)) return { status: "FAILED: the cloud machine stopped before it finished (it ran out of time or was shut down). Start it again.\n", done: true, ok: false };
    return { status: "", done: false, ok: false };
  }
}
