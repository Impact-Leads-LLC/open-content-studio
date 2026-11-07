#!/usr/bin/env node
// Transcribe a video or audio file on this computer with whisper.cpp (whisper-cli), into transcript.json and
// transcript.txt (the same shape transcript.mjs writes). Nothing leaves the computer.
//
//   node transcribe.mjs <media> --out <episode-dir> [--lang en] [--model <ggml model .bin>] [--words]
//
// --words also keeps a time for every word (slower; reels get their own word times from reel.mjs anyway).
// The model: --model, then WHISPER_MODEL, then the usual folders (~/.cache/whisper, ~/.cache/whisper.cpp,
// ~/.cache/hyperframes/whisper/models, ~/whisper-models). small.en is the best trade for English on a laptop.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { args, die, ffmpeg, need, run, probe, writeJSON, clock, exists, findModel, whisperCli } from "./lib.mjs";
import { noteMinutes } from "./lib.mjs";

const o = args();
const media = o._[0] ? path.resolve(o._[0]) : die("Usage: node transcribe.mjs <media> --out <episode-dir> [--lang en] [--model file] [--words]");
if (!exists(media)) die(`No file at ${media}`);
const outDir = path.resolve(o.out ?? path.dirname(media));
const work = path.join(outDir, "work");
fs.mkdirSync(work, { recursive: true });
const lang = String(o.lang ?? "en");

const cli = whisperCli();
if (!cli) die(`whisper.cpp isn't installed. Mac: brew install whisper-cpp. Windows: download whisper-bin-x64.zip from the whisper.cpp releases page and put whisper-cli.exe on the PATH.
No time for that? Send a transcript instead (Riverside, Descript, YouTube captions, .srt or .vtt).`);
const model = findModel(o.model, lang);
if (!model) die(`No whisper model found. Download one (about 470 MB, once):
  mkdir -p ~/.cache/whisper && curl -L -o ~/.cache/whisper/ggml-small${lang === "en" ? ".en" : ""}.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small${lang === "en" ? ".en" : ""}.bin`);

const f = need(ffmpeg(), "ffmpeg");
const info = probe(media);
if (!info.hasAudio) die(`${path.basename(media)} has no audio track to transcribe.`);
const wav = path.join(work, "audio16k.wav");
console.log(`audio: ${Math.round(info.duration / 60)} min, extracting...`);
run(f, ["-v", "error", "-y", "-i", media, "-vn", "-ac", "1", "-ar", "16000", wav]);
const base = path.join(work, "whisper");
const a = ["-m", model, "-f", wav, "-oj", "-of", base, "-l", lang, "-t", String(Math.max(2, Math.min(8, os.cpus().length - 1)))];
if (o.words) a.push("-ml", "1", "-sow");
console.log(`transcribing with ${path.basename(model)} (an hour of audio takes a few minutes on a recent laptop)...`);
const t0 = Date.now();
run(cli, a, { stdio: ["ignore", "ignore", "pipe"] });
const j = JSON.parse(fs.readFileSync(`${base}.json`, "utf8"));
const segs = (j.transcription ?? []).map((s) => ({ t: s.offsets.from / 1000, end: s.offsets.to / 1000, text: String(s.text ?? "").trim() })).filter((s) => s.text && !/^\s*[[(]/.test(s.text));
let lines, words;
if (o.words) {
  words = segs.map((s) => ({ text: s.text, start: s.t, end: s.end }));
  // rebuild sentence lines from the words
  lines = [];
  let cur = null;
  for (const w of words) {
    if (!cur) cur = { t: w.start, end: w.end, who: "", text: w.text };
    else { cur.text += (/^[,.!?;:'’]/.test(w.text) ? "" : " ") + w.text; cur.end = w.end; }
    if (/[.!?]$/.test(w.text)) { lines.push(cur); cur = null; }
  }
  if (cur) lines.push(cur);
} else lines = segs.map((s) => ({ t: Math.round(s.t * 10) / 10, end: Math.round(s.end * 10) / 10, who: "", text: s.text }));
const count = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
writeJSON(path.join(outDir, "transcript.json"), { source: path.basename(media), engine: `whisper.cpp ${path.basename(model)}`, rough: false, minutes: Math.round(info.duration / 60), words: count, speakers: [], lines, ...(words ? { words_timed: words } : {}) });
fs.writeFileSync(path.join(outDir, "transcript.txt"), lines.map((l) => `[${clock(l.t)}] ?: ${l.text}`).join("\n") + "\n");
noteMinutes(outDir, Math.round(info.duration / 60));
console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s: ${lines.length} lines, ${count} words. whisper doesn't know who is speaking, so the lines say "?": name the speakers from context.`);
console.log(`wrote ${path.join(outDir, "transcript.json")} and transcript.txt`);
