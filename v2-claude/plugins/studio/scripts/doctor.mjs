#!/usr/bin/env node
// Checks this computer has what the studio needs, and says the one-line install for anything missing.
//
//   node doctor.mjs [--studio <dir>] [--json]
import os from "node:os";
import path from "node:path";
import { args, findStudio, findChrome, ffmpeg, ffprobe, run, whisperCli, findModel, exists, readJSON } from "./lib.mjs";

const o = args();
const mac = process.platform === "darwin", win = process.platform === "win32";
const checks = [];
const add = (name, ok, detail, fix, needed = true) => checks.push({ name, ok, detail, fix: ok ? "" : fix, needed });

const major = Number(process.versions.node.split(".")[0]);
add("Node.js 20+", major >= 20, `v${process.versions.node}`, mac ? "brew install node" : win ? "winget install OpenJS.NodeJS.LTS" : "install Node.js 20 or newer");

const f = ffmpeg(), fp = ffprobe();
let filters = "", enc = "";
if (f) { try { filters = run(f, ["-hide_banner", "-filters"]).stdout; enc = run(f, ["-hide_banner", "-encoders"]).stdout; } catch {} }
const ffFix = mac ? "brew install ffmpeg" : win ? "winget install Gyan.FFmpeg" : "sudo apt install ffmpeg";
add("ffmpeg", !!f, f ?? "not found", ffFix);
add("ffprobe", !!fp, fp ?? "not found", ffFix);
add("ffmpeg can burn captions (libass)", /\bsubtitles\b/.test(filters), filters ? (/\bsubtitles\b/.test(filters) ? "yes" : "this ffmpeg was built without libass") : "no ffmpeg", `${ffFix} (the standard builds include it)`);
add("ffmpeg can write MP4 (libx264)", /libx264/.test(enc), enc ? (/libx264/.test(enc) ? "yes" : "no libx264 encoder") : "no ffmpeg", ffFix);

const c = findChrome();
add("A headless browser (Chrome, Edge or Chromium)", !!c, c ? c.path : "not found", "install Google Chrome, or run: npx hyperframes@0.8.143 browser ensure");

const w = whisperCli(), m = findModel(null, "en");
add("whisper.cpp (only to transcribe here)", !!w, w ?? "not found", mac ? "brew install whisper-cpp" : win ? "download whisper-bin-x64.zip from github.com/ggml-org/whisper.cpp/releases and put whisper-cli.exe on the PATH" : "build whisper.cpp from github.com/ggml-org/whisper.cpp", false);
add("a whisper model", !!m, m ?? "not found", `mkdir -p ~/.cache/whisper && curl -L -o ~/.cache/whisper/ggml-small.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin`, false);
add("fal key in this shell (only for generated cover pictures)", !!process.env.FAL_KEY, process.env.FAL_KEY ? "set" : "not set", "optional: see picture.mjs for how to keep it in the Keychain", false);

const studio = findStudio(o.studio ?? process.cwd(), o.studio);
if (studio) {
  const brandFiles = ["brief.md", "voice.md", "coach.md", "banned.md", "palette.json", "rhythm.json", "settings.json"];
  const missing = brandFiles.filter((x) => !exists(path.join(studio, "brand", x)));
  add("studio folder", !missing.length, missing.length ? `${studio} is missing brand/${missing.join(", brand/")}` : studio, "run studio-setup");
  add("library index", exists(path.join(studio, "library", "index.md")), exists(path.join(studio, "library", "index.md")) ? "ok" : "no library/index.md", "node library.mjs index <studio>", false);
  const s = readJSON(path.join(studio, "brand", "settings.json"), {});
  add("retention rule", !!s.retention, s.retention ? `renders cleared ${s.retention.renders_days ?? 7} days after posting (${s.retention.action ?? "delete"})` : "not set", "run studio-setup", false);
} else add("studio folder", false, "none found here", "say quick start (or set up my studio) in the folder you work in", false);

const sandbox = process.platform === "linux" && (exists("/opt/pw-browsers") || process.getuid?.() === 0);
if (o.json) console.log(JSON.stringify({ platform: `${os.platform()} ${os.arch()}`, sandbox, checks }, null, 2));
else {
  console.log(`Studio doctor (${os.platform()} ${os.arch()}${sandbox ? ", looks like Claude's sandbox" : ""})`);
  for (const x of checks) console.log(`${x.ok ? "OK  " : x.needed ? "MISS" : "opt "}  ${x.name}: ${x.detail}${x.fix ? `\n        fix: ${x.fix}` : ""}`);
  const bad = checks.filter((x) => !x.ok && x.needed);
  console.log(bad.length ? `\n${bad.length} needed item${bad.length > 1 ? "s" : ""} missing.` : "\nEverything the studio needs is here.");
}
process.exit(checks.some((x) => !x.ok && x.needed) ? 1 : 0);
