#!/usr/bin/env node
// Turn any transcript into the one shape the studio reads: transcript.json ({ lines: [{ t, who, text }], rough, words? })
// and transcript.txt ("[mm:ss] Who: text", one line each, for reading and planning).
//
//   node transcript.mjs <file> --out <episode-dir> [--speakers "Speaker 1=Dana Lee,Speaker 2=Sam Ortiz"]
//
// Reads: .srt and .vtt captions (YouTube, Descript, Riverside, Zoom), Riverside's text export ("Name (12:04.512)" before
// each turn), lines that start with a time ("[00:12:04] Name: text", "12:04 Name: text"), YouTube's "Show transcript"
// copy (a time on one line, the words on the next), whisper.cpp JSON, this script's own JSON, and plain text with no
// times at all (times are then estimated from word counts, about 2.5 words a second, and marked rough).
// A Word file: convert it to text first (Mac: textutil -convert txt file.docx), or let Claude read it and save a .txt.
import fs from "node:fs";
import path from "node:path";
import { args, die, readText, writeJSON, secs, clock } from "./lib.mjs";
import { noteMinutes } from "./lib.mjs";

const o = args();
const file = o._[0] ? path.resolve(o._[0]) : die("Usage: node transcript.mjs <file> --out <episode-dir> [--speakers \"A=Name,B=Name\"]");
const outDir = path.resolve(o.out ?? path.dirname(file));
const raw = readText(file).replace(/\r/g, "").replace(/^﻿/, "");
if (!raw.trim()) die(`${file} is empty or couldn't be read.`);
const TIME = String.raw`(?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d+)?`;

const sentences = (text) => text.split(/(?<=[.!?])\s+(?=\S)/).map((s) => s.trim()).filter(Boolean);
// a long turn becomes one line per sentence, times spread by word count up to the next turn
function spread(turns) {
  const lines = [];
  turns.forEach((turn, i) => {
    const said = sentences(turn.parts.join(" "));
    const words = said.map((s) => s.split(/\s+/).length);
    const total = words.reduce((a, x) => a + x, 0) || 1;
    const next = turns[i + 1]?.t;
    const span = next && next > turn.t ? next - turn.t : total / 2.5;
    let w = 0;
    said.forEach((s, k) => { lines.push({ t: Math.round((turn.t + (w / total) * span) * 10) / 10, who: turn.who, text: s }); w += words[k]; });
  });
  return lines;
}
const speakerSplit = (body) => {
  const m = body.match(/^([A-Z][\w .'’-]{0,40}?):\s+(.*)$/s);
  return m && !/^(https?|note)$/i.test(m[1]) ? { who: m[1].trim(), text: m[2].trim() } : { who: "", text: body.trim() };
};

function parse() {
  // JSON: whisper.cpp output or our own
  if (/^\s*[{[]/.test(raw)) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j.lines)) return { lines: j.lines, rough: !!j.rough, words: j.words };
      if (Array.isArray(j.transcription)) {
        return { lines: j.transcription.map((s) => ({ t: (s.offsets?.from ?? 0) / 1000, end: (s.offsets?.to ?? 0) / 1000, who: "", text: String(s.text ?? "").trim() })).filter((l) => l.text && !/^[[(]/.test(l.text)), rough: false };
      }
      if (Array.isArray(j.segments)) return { lines: j.segments.map((s) => ({ t: Number(s.start ?? 0), end: Number(s.end ?? 0), who: s.speaker ?? "", text: String(s.text ?? "").trim() })).filter((l) => l.text), rough: false };
    } catch {}
  }
  // captions
  if (/-->/.test(raw)) {
    const lines = [];
    for (const block of raw.split(/\n\s*\n/)) {
      const m = block.match(new RegExp(`(${TIME})\\s*-->\\s*(${TIME})`));
      if (!m) continue;
      const after = block.indexOf("\n", block.indexOf("-->"));
      let body = after < 0 ? "" : block.slice(after + 1);
      const v = body.match(/<v\s+([^>]+)>/);
      body = body.replace(/<[^>]+>/g, "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
      if (!body) continue;
      const sp = v ? { who: v[1].trim(), text: body } : speakerSplit(body);
      const prev = lines[lines.length - 1];
      // YouTube's rolling captions repeat the previous line; keep only what's new
      if (prev && sp.text.startsWith(prev.text) && sp.text.length > prev.text.length) { prev.text = sp.text; prev.end = secs(m[2]); continue; }
      if (prev && prev.text === sp.text) continue;
      lines.push({ t: secs(m[1]), end: secs(m[2]), who: sp.who, text: sp.text });
    }
    return { lines, rough: false };
  }
  const rows = raw.split("\n");
  // Riverside: "Name (12:04.512)" on its own line, then the turn
  if (rows.some((r) => new RegExp(`^.{1,60}?\\s*\\((${TIME})\\)\\s*$`).test(r))) {
    const turns = [];
    for (const block of raw.split(/\n\s*\n/)) {
      const rs = block.split("\n");
      const m = rs[0].match(new RegExp(`^(.{1,60}?)\\s*\\((${TIME})\\)\\s*$`));
      if (m) { turns.push({ t: secs(m[2]), who: m[1].trim(), parts: [rs.slice(1).join(" ").trim()].filter(Boolean) }); continue; }
      if (turns.length && block.trim()) turns[turns.length - 1].parts.push(block.replace(/\n/g, " ").trim());
    }
    return { lines: spread(turns), rough: true };
  }
  // "Name  12:04" or "Name 00:12:04" on its own line, then the turn (Otter, some Descript exports)
  if (rows.filter((r) => new RegExp(`^[A-Z][\\w .'-]{0,40}?\\s+(${TIME})\\s*$`).test(r)).length >= 2) {
    const turns = [];
    let cur = null;
    for (const r of rows) {
      const m = r.match(new RegExp(`^([A-Z][\\w .'-]{0,40}?)\\s+(${TIME})\\s*$`));
      if (m) { cur = { t: secs(m[2]), who: m[1].trim(), parts: [] }; turns.push(cur); continue; }
      if (cur && r.trim()) cur.parts.push(r.trim());
    }
    return { lines: spread(turns), rough: true };
  }
  // "[00:12:04] Name: text" or "12:04 Name: text" or "(12:04) text"
  const stamped = rows.map((r) => r.match(new RegExp(`^\\s*[\\[(]?(${TIME})[\\])]?\\s*[-:]?\\s+(.*)$`)));
  if (stamped.filter(Boolean).length >= Math.max(2, rows.filter((r) => r.trim()).length * 0.3)) {
    const turns = [];
    for (let i = 0; i < rows.length; i++) {
      const m = stamped[i];
      if (m) { const sp = speakerSplit(m[2]); turns.push({ t: secs(m[1]), who: sp.who, parts: [sp.text].filter(Boolean) }); continue; }
      if (turns.length && rows[i].trim()) turns[turns.length - 1].parts.push(rows[i].trim());
    }
    return { lines: spread(turns), rough: true };
  }
  // YouTube "Show transcript" copy: a time alone on a line, the words on the next
  const alone = rows.filter((r) => new RegExp(`^\\s*(${TIME})\\s*$`).test(r)).length;
  if (alone >= 3) {
    const turns = [];
    for (const r of rows) {
      const m = r.match(new RegExp(`^\\s*(${TIME})\\s*$`));
      if (m) { turns.push({ t: secs(m[1]), who: "", parts: [] }); continue; }
      if (turns.length && r.trim()) turns[turns.length - 1].parts.push(r.trim());
    }
    return { lines: turns.filter((x) => x.parts.length).map((x) => ({ t: x.t, who: "", text: x.parts.join(" ") })), rough: false };
  }
  // plain text: times from word counts
  let t = 0;
  const lines = [];
  for (const para of raw.split(/\n\s*\n/)) {
    const sp = speakerSplit(para.replace(/\n/g, " ").trim());
    for (const s of sentences(sp.text)) { lines.push({ t: Math.round(t * 10) / 10, who: sp.who, text: s }); t += s.split(/\s+/).length / 2.5; }
  }
  return { lines, rough: true, estimated: true };
}

const r = parse();
if (!r.lines?.length) die("No lines could be read from that transcript. Send it as .srt, .vtt or .txt.");
const names = Object.fromEntries(String(o.speakers ?? "").split(",").map((p) => p.split("=").map((x) => x.trim())).filter((p) => p.length === 2 && p[0]));
for (const l of r.lines) { l.text = String(l.text).replace(/\s+/g, " ").trim(); if (names[l.who]) l.who = names[l.who]; }
const words = r.lines.reduce((a, l) => a + l.text.split(/\s+/).length, 0);
const last = r.lines[r.lines.length - 1];
const minutes = Math.round(((last.end ?? last.t) + 5) / 60);
const who = [...new Set(r.lines.map((l) => l.who).filter(Boolean))];
fs.mkdirSync(outDir, { recursive: true });
writeJSON(path.join(outDir, "transcript.json"), { source: path.basename(file), rough: !!r.rough, estimated: !!r.estimated, minutes, words, speakers: who, lines: r.lines, ...(r.words ? { words_timed: r.words } : {}) });
fs.writeFileSync(path.join(outDir, "transcript.txt"), r.lines.map((l) => `[${clock(l.t)}] ${l.who || "?"}: ${l.text}`).join("\n") + "\n");
noteMinutes(outDir, minutes);
console.log(`transcript: ${r.lines.length} lines, ${words} words, about ${minutes} min${r.estimated ? " (no times in the file: estimated from word counts)" : r.rough ? " (times per turn; lines in between are estimates)" : ""}`);
console.log(`speakers: ${who.length ? who.join(", ") : "none named (give them with --speakers, or Claude names them from context)"}`);
console.log(`wrote ${path.join(outDir, "transcript.json")} and transcript.txt`);
