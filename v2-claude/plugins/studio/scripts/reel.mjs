#!/usr/bin/env node
// Cut a reel from a video: one stretch (start to end), trimmed to the words, long pauses tightened, made upright at
// 1080x1920, with word-by-word captions burned in and an optional hook line for the first seconds. ffmpeg only, so it
// runs on a laptop: no cloud, no background removal, no animation engine.
//
//   node reel.mjs --src <video> --start 12:04 --end 12:51 --out <piece-dir>
//       [--words <words.json>]      word times you already have (episode seconds); otherwise whisper.cpp times the clip
//       [--layout auto|fit|crop]    a landscape video: fit (the whole frame over a blurred fill, the default) or crop
//       [--focus 0.5]               with crop: where the speaker sits across the frame, 0 = left edge, 1 = right edge
//       [--tighten 0.7]             pauses longer than this many seconds are cut down to about 0.2 s (0 = keep them)
//       [--hook "Your invoice is / the cash plan" --accent "cash plan" --hook-seconds 3]
//       [--caps] [--no-captions] [--lang en] [--studio <studio-dir>]
//
// Writes <piece-dir>/reel.mp4, thumb.jpg, sheet.jpg (a frame every 3 seconds, for the review), captions.ass, words.json
// and reel.json, and prints the first and last words so you can check it starts on the hook and ends where the point
// lands.
import fs from "node:fs";
import path from "node:path";
import { args, die, findStudio, brand, ffmpeg, need, run, probe, secs, clock, writeJSON, readJSON, exists, whisperCli, findModel, fontNames } from "./lib.mjs";

const o = args();
const usage = "Usage: node reel.mjs --src <video> --start mm:ss --end mm:ss --out <piece-dir> [--words file] [--layout fit|crop] [--focus 0.5] [--tighten 0.7] [--hook \"line\" --accent \"word\"]";
const src = o.src ? path.resolve(o.src) : die(usage);
if (!exists(src)) die(`No video at ${src}`);
const start = secs(o.start), end = secs(o.end);
if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) die(`--start and --end must be times like 12:04 and 12:51, end after start. ${usage}`);
if (end - start > 180) die("That stretch is over three minutes. Reels run 20 to 90 seconds: pick a shorter one.");
const out = path.resolve(o.out ?? die(usage));
const work = path.join(out, "work");
fs.mkdirSync(path.join(work, "fonts"), { recursive: true });
const studio = findStudio(out, o.studio);
const b = brand(studio), C = b.c;
const F = need(ffmpeg(), "ffmpeg");
const info = probe(src);
if (!info.hasVideo) die(`${path.basename(src)} has no video track. A reel needs footage; for audio only, make a carousel or a post instead.`);
if (!info.hasAudio) die(`${path.basename(src)} has no audio track.`);
const PAD = 0.5;
// a short punctuated prompt keeps whisper writing sentences with capitals and full stops, which the captions break on
const PROMPT = "Okay, so here's the idea. It's simple, and it works.";
const a = Math.max(0, start - PAD), bEnd = Math.min(info.duration || end + PAD, end + PAD), clipDur = bEnd - a;
const FPS = 30, snap = (t) => Math.round(t * FPS) / FPS;

// ---- 1. word times for the clip -------------------------------------------------------------------------------------
let words = null;
if (o.words) {
  const j = readJSON(path.resolve(o.words));
  const all = j.words ?? j.words_timed ?? [];
  words = all.filter((w) => w.end > a && w.start < bEnd).map((w) => ({ text: String(w.text).trim(), start: Math.max(0, w.start - a), end: Math.min(clipDur, w.end - a) })).filter((w) => w.text);
} else if (!o["no-captions"]) {
  const cli = whisperCli(), model = findModel(null, String(o.lang ?? "en"));
  if (!cli || !model) die("Captions need word times: install whisper.cpp and a model (node doctor.mjs shows how), pass --words, or use --no-captions.");
  const wav = path.join(work, "clip.wav");
  run(F, ["-v", "error", "-y", "-ss", String(a), "-t", String(clipDur), "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-af", "apad=pad_dur=0.5", wav]);
  run(cli, ["-m", model, "-f", wav, "-oj", "-of", path.join(work, "clip"), "-ml", "1", "-sow", "-l", String(o.lang ?? "en"), ...(String(o.lang ?? "en") === "en" ? ["--prompt", PROMPT] : [])], { stdio: ["ignore", "ignore", "pipe"] });
  const j = readJSON(path.join(work, "clip.json"));
  words = (j.transcription ?? []).map((s) => ({ text: String(s.text ?? "").trim(), start: s.offsets.from / 1000, end: s.offsets.to / 1000 }))
    .filter((w) => w.text && !/^[[(].*[\])]$/.test(w.text) && w.end > w.start);
}
// whisper sometimes splits punctuation into its own token: glue it to the word before
if (words) {
  const glued = [];
  for (const w of words) {
    if (glued.length && /^[,.!?;:%'\u2019]+$|^'(s|re|ve|ll|d|t|m)$/i.test(w.text)) { glued[glued.length - 1].text += w.text; glued[glued.length - 1].end = w.end; }
    else glued.push({ ...w });
  }
  words = glued;
}
// keep the words inside the asked-for stretch
const lo0 = start - a, hi0 = end - a;
const kept = (words ?? []).filter((w) => { const m = (w.start + w.end) / 2; return m >= lo0 - 0.25 && m <= hi0 + 0.25; });
if (words && !kept.length && !o["no-captions"]) die("No words were heard in that stretch. Check the times against the transcript.");

// ---- 2. the cut: trimmed to the words, long pauses tightened ---------------------------------------------------------
const lo = kept.length ? Math.max(0, kept[0].start - 0.12) : lo0;
const hi = kept.length ? Math.min(clipDur, kept[kept.length - 1].end + 0.35) : hi0;
const tighten = o.tighten === undefined ? 0.7 : Number(o.tighten);
let segs = [[lo, hi]];
if (kept.length > 1 && tighten > 0) {
  segs = [];
  let s0 = lo;
  for (let i = 0; i < kept.length - 1; i++) {
    const gap = kept[i + 1].start - kept[i].end;
    if (gap > tighten) { segs.push([s0, kept[i].end + 0.12]); s0 = kept[i + 1].start - 0.1; }
  }
  segs.push([s0, hi]);
}
segs = segs.map(([x, y]) => [snap(x), snap(y)]).filter(([x, y]) => y - x >= 0.2);
let tl = 0;
const timeline = segs.map(([x, y]) => { const s = { in: x, out: y, at: tl }; tl += y - x; return s; });
const total = Math.round(tl * 1000) / 1000;
const remap = (t) => { for (const s of timeline) if (t >= s.in - 0.02 && t <= s.out + 0.02) return Math.max(s.at, Math.min(s.at + (s.out - s.in), s.at + t - s.in)); return null; };
const cutWords = kept.map((w) => ({ text: w.text, start: remap(w.start), end: remap(w.end) })).filter((w) => w.start !== null && w.end !== null && w.end > w.start);

// ---- 3. captions (ASS, burned in by libass) --------------------------------------------------------------------------
const assColor = (hex, alpha = "00") => { const h = String(hex).replace("#", ""); return `&H${alpha}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); };
const capFont = b.fonts.caption.file;
fs.copyFileSync(capFont, path.join(work, "fonts", path.basename(capFont)));
const fn = fontNames(capFont);
const capName = fn.full || fn.family || b.fonts.caption.family;
const portrait = info.height > info.width * 1.2;
const layout = portrait ? "portrait" : o.layout === "crop" ? "crop" : "fit";
const marginV = layout === "fit" ? 470 : 520;
const t2 = (t) => { const cs = Math.max(0, Math.round(t * 100)); const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100; return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`; };
const assText = (s) => String(s).replace(/[{}]/g, "").replace(/\\/g, "/");
const capWord = (w) => { let t = w.replace(/^[^\w$#@'\u2019]+|[.,;:]+$/g, "").replace(/[\u2014\u2013]/g, ""); return o.caps ? t.toUpperCase() : t; };
const groups = [];
for (const w of cutWords) {
  const g = groups[groups.length - 1];
  const t = capWord(w.text);
  if (!t) continue;
  const len = g ? g.words.reduce((n, x) => n + x.t.length + 1, 0) + t.length : 0;
  if (!g || g.words.length >= 3 || len > 18 || w.start - g.words[g.words.length - 1].end > 0.3 || /[.!?,;:]$/.test(g.words[g.words.length - 1].raw)) groups.push({ words: [{ t, raw: w.text, start: w.start, end: w.end }] });
  else g.words.push({ t, raw: w.text, start: w.start, end: w.end });
}
const events = [];
const white = "&H00FFFFFF";
// colour tags inside the text take &HBBGGRR& (no alpha)
const tag = (hex) => { const h = String(hex).replace("#", ""); return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase(); };
const ACC = tag(C.accent), WH = "&HFFFFFF&";
groups.forEach((g, gi) => {
  const next = groups[gi + 1];
  const gEnd = next && next.words[0].start - g.words[g.words.length - 1].end < 0.5 ? next.words[0].start : g.words[g.words.length - 1].end + 0.25;
  g.words.forEach((w, wi) => {
    const s = wi === 0 ? g.words[0].start : w.start;
    const e = wi < g.words.length - 1 ? g.words[wi + 1].start : gEnd;
    if (e <= s) return;
    const text = g.words.map((x, k) => (k === wi ? `{\\c${ACC}}${assText(x.t)}{\\c${WH}}` : assText(x.t))).join(" ");
    events.push(`Dialogue: 0,${t2(s)},${t2(e)},Cap,,0,0,0,,${text}`);
  });
});
if (o.hook) {
  const hs = Number(o["hook-seconds"] ?? 3);
  const acc = String(o.accent ?? "").trim();
  const lines = String(o.hook).split(/\s*\/\s*/).map((l) => {
    const e = assText(l.replace(/[\u2014\u2013]/g, ","));
    if (!acc) return e;
    const i = e.toLowerCase().indexOf(acc.toLowerCase());
    return i < 0 ? e : `${e.slice(0, i)}{\\c${ACC}}${e.slice(i, i + acc.length)}{\\c${WH}}${e.slice(i + acc.length)}`;
  });
  events.push(`Dialogue: 1,${t2(0)},${t2(Math.min(hs, total))},Hook,,0,0,0,,${lines.join("\\N")}`);
}
const box = assColor(C.board), ink = assColor(C.ink);
fs.writeFileSync(path.join(out, "captions.ass"), `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${capName},84,${white},${white},${ink},&H64000000,0,0,0,0,100,100,0,0,1,7,2,2,70,70,${marginV},1
Style: Hook,${capName},72,${white},${white},${box},${box},0,0,0,0,100,100,0,0,3,24,0,8,90,90,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`);

// ---- 4. one ffmpeg pass: cut, upright, captions ----------------------------------------------------------------------
const W = info.width, H = info.height;
let shape;
if (layout === "portrait") shape = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`;
else if (layout === "crop") {
  const cw = Math.floor((H * 9) / 16 / 2) * 2, focus = Math.max(0, Math.min(1, Number(o.focus ?? 0.5)));
  const x = Math.max(0, Math.min(W - cw, Math.round(focus * W - cw / 2)));
  shape = `crop=${cw}:${H}:${x}:0,scale=1080:1920`;
} else shape = `split=2[bs][fs];[bs]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.08[bg];[fs]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
const parts = [];
timeline.forEach((s, i) => {
  const d = s.out - s.in;
  parts.push(`[0:v]trim=start=${s.in.toFixed(3)}:end=${s.out.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
  parts.push(`[0:a]atrim=start=${s.in.toFixed(3)}:end=${s.out.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st=${Math.max(0, d - 0.012).toFixed(3)}:d=0.012[a${i}]`);
});
parts.push(`${timeline.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${timeline.length}:v=1:a=1[vc][ac]`);
const burn = events.length ? `,subtitles=captions.ass:fontsdir=work/fonts` : "";
parts.push(`[vc]fps=${FPS},${shape},format=yuv420p${burn}[vo]`);
const mp4 = path.join(out, "reel.mp4");
console.log(`cutting ${clock(a + lo)} to ${clock(a + hi)} of ${path.basename(src)} (${layout}, ${timeline.length} part${timeline.length > 1 ? "s" : ""}, ${total.toFixed(1)} s)...`);
run(F, ["-v", "error", "-y", "-ss", a.toFixed(3), "-t", clipDur.toFixed(3), "-i", src, "-filter_complex", parts.join(";"), "-map", "[vo]", "-map", "[ac]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-r", String(FPS), "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", "reel.mp4"], { cwd: out });

// ---- 5. previews for the review -------------------------------------------------------------------------------------
const got = probe(mp4);
run(F, ["-v", "error", "-y", "-ss", String(Math.min(1, got.duration / 2)), "-i", mp4, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "3", path.join(out, "thumb.jpg")]);
const rows = Math.max(1, Math.ceil(Math.round(got.duration / 3) / 4));
run(F, ["-v", "error", "-y", "-i", mp4, "-vf", `fps=1/3,scale=270:-2,tile=4x${rows}:padding=6:color=white`, "-frames:v", "1", "-q:v", "4", path.join(out, "sheet.jpg")]);
writeJSON(path.join(out, "words.json"), { total, words: cutWords });
writeJSON(path.join(out, "reel.json"), {
  src, asked: { start: clock(start, true), end: clock(end, true) }, cut: { from: clock(a + lo, true), to: clock(a + hi, true) }, layout, focus: layout === "crop" ? Number(o.focus ?? 0.5) : null,
  tighten, parts: timeline.map((s) => ({ from: clock(a + s.in, true), to: clock(a + s.out, true), at: Math.round(s.at * 100) / 100 })), duration: Math.round(got.duration * 100) / 100,
  hook: o.hook ?? null, captions: events.length ? capName : null, made: new Date().toISOString(),
});
const say = (ws) => ws.map((w) => w.text).join(" ");
console.log(`reel: ${mp4} (${got.width}x${got.height}, ${got.duration.toFixed(1)} s)`);
if (cutWords.length) {
  console.log(`starts: "${say(cutWords.slice(0, 10))}"`);
  console.log(`ends:   "${say(cutWords.slice(-10))}"`);
}
if (got.duration < 15) console.log("note: under 15 seconds; most reels that teach run 20 to 75.");
console.log(`review frames: ${path.join(out, "sheet.jpg")}`);
