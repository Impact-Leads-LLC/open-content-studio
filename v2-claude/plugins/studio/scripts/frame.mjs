#!/usr/bin/env node
// Grab one still from a video at a time, full size (for a carousel cover, a reel cover, or to look at where the
// speaker sits before choosing --layout crop and --focus for a reel).
//
//   node frame.mjs <video> <mm:ss> <out.jpg> [--width 1080]
import path from "node:path";
import { args, die, ffmpeg, need, run, secs, probe, exists } from "./lib.mjs";

const o = args();
const [src, at, out] = o._;
if (!src || !at || !out) die("Usage: node frame.mjs <video> <mm:ss> <out.jpg> [--width 1080]");
if (!exists(src)) die(`No video at ${src}`);
const t = secs(at);
if (!Number.isFinite(t)) die(`${at} isn't a time like 12:04.`);
const a = ["-v", "error", "-y", "-ss", String(t), "-i", path.resolve(src), "-frames:v", "1", "-q:v", "2"];
if (o.width) a.push("-vf", `scale=${Number(o.width)}:-2`);
run(need(ffmpeg(), "ffmpeg"), [...a, path.resolve(out)]);
const p = probe(path.resolve(out));
console.log(`still: ${path.resolve(out)} (${p.width}x${p.height}). Use it no larger than this: a still is never blown up.`);
