#!/usr/bin/env node
// The mechanical half of the voice check: things a script can catch for certain, so the humanizer and the coach can
// spend their attention on what only a reader can judge. Checks the publishable part of post.md, caption.md or a
// carousel's copy.md (the text above a line of three dashes).
//
//   node lint.mjs <file ...> [--kind post|caption|slides] [--studio dir] [--json]
//
// Flags: em and en dashes; every phrase and pattern in studio/brand/banned.md; exclamation marks; hashtags (unless the
// brief allows them); placeholders such as [LINK] or {url}; a missing save line (posts and captions); a first line too
// long for the fold; captions over 2,200 characters; a paragraph broken across lines by hand (posts and captions).
// Exits 1 when anything is flagged.
import fs from "node:fs";
import path from "node:path";
import { args, die, readText, findStudio } from "./lib.mjs";

const o = args();
if (!o._.length) die("Usage: node lint.mjs <file ...> [--kind post|caption|slides] [--studio dir] [--json]");
const studio = findStudio(path.dirname(path.resolve(o._[0])), o.studio);
const bannedRaw = studio ? readText(path.join(studio, "brand", "banned.md")) : "";
const brief = studio ? readText(path.join(studio, "brand", "brief.md")) : "";
const hashtagsOk = /hashtags?:\s*(yes|allowed|use)/i.test(brief);

// banned.md: "- phrase" lines under "## Phrases", "- /regex/flags  why" lines under "## Patterns"
const phrases = [], patterns = [];
let sec = "";
for (const line of bannedRaw.split("\n")) {
  const h = line.match(/^#+\s*(.*)$/);
  if (h) { sec = h[1].toLowerCase(); continue; }
  const m = line.match(/^\s*[-*]\s+(.+?)\s*$/);
  if (!m) continue;
  const item = m[1].replace(/^["“]|["”]$/g, "");
  const re = item.match(/^\/(.+)\/([a-z]*)\s*(.*)$/);
  if (re) { try { patterns.push({ re: new RegExp(re[1], re[2].includes("i") ? re[2] : `${re[2]}i`), why: re[3] || item }); } catch {} continue; }
  if (sec.startsWith("phrase") || sec.startsWith("word")) phrases.push(item.replace(/\s+\(.*\)$/, "").trim());
}
// built in: the contrast construction every guardrail list bans, in its common forms
patterns.push(
  { re: /\b(it'?s|it is|this is|that'?s|that is)\s+not\s+(just\s+)?(about\s+)?[^.,;:!?]{1,50}[,;:.]\s*(it'?s|it is|this is|that'?s)\b/i, why: "contrast construction (\"it's not X, it's Y\")" },
  { re: /\bisn'?t\s+(just\s+)?about\s+[^.,;:!?]{1,50}[,;:.]?\s*it'?s\s+about\b/i, why: "contrast construction (\"isn't about X, it's about Y\")" },
  { re: /\bnot\s+because\s+[^.,;]{1,50},\s*but\s+because\b/i, why: "contrast construction (\"not because X, but because Y\")" },
);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let flagged = 0;
const results = [];
for (const f of o._) {
  const full = readText(path.resolve(f));
  if (!full) { results.push({ file: f, issues: [{ line: 0, what: "file is empty or missing" }] }); flagged++; continue; }
  const text = full.split(/\n-{3,}\s*\n/)[0].replace(/^# .*\n+/, "").trim();
  const kind = o.kind ?? (/caption/i.test(path.basename(f)) ? "caption" : /copy\.md$/i.test(f) ? "slides" : "post");
  const lines = text.split("\n");
  const issues = [];
  lines.forEach((l, i) => {
    const n = i + 1;
    if (/[\u2014\u2013]/.test(l)) issues.push({ line: n, what: "em or en dash" });
    if (/!/.test(l.replace(/!\[/g, ""))) issues.push({ line: n, what: "exclamation mark" });
    if (!hashtagsOk && /(^|\s)#[A-Za-z]\w+/.test(l)) issues.push({ line: n, what: "hashtag (the brief doesn't allow them)" });
    if (/\[(link|url|episode[^\]]*|booking[^\]]*|insert[^\]]*)\]|\{(url|link)\}|TODO|TK\b/i.test(l)) issues.push({ line: n, what: "placeholder left in" });
    for (const p of phrases) if (p && new RegExp(`(^|[^\\w])${esc(p)}([^\\w]|$)`, "i").test(l)) issues.push({ line: n, what: `banned: "${p}"` });
    for (const p of patterns) if (p.re.test(l)) issues.push({ line: n, what: `banned pattern: ${p.why}` });
  });
  if (kind !== "slides") {
    // a paragraph broken across lines by hand: the next line goes on mid-sentence (lists and steps are fine)
    lines.forEach((l, i) => {
      const next = lines[i + 1] ?? "";
      if (l.trim() && /^[a-z("'“]/.test(next.trim()) && !/[.!?:”"]$/.test(l.trim()) && !/^\s*([-*•]|\d+[.)])\s/.test(next)) issues.push({ line: i + 1, what: "a sentence runs onto the next line: keep each paragraph on one line, exactly as it will be pasted" });
    });
    const paras = text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    if (!paras.slice(0, -1).some((x) => /\bsave\b/i.test(x)) && !(paras.length === 1 && /\bsave\b/i.test(paras[0]))) issues.push({ line: 0, what: "no save line before the next step" });
    const first = lines.find((l) => l.trim()) ?? "";
    const cap = kind === "caption" ? 90 : 140;
    if (first.length > cap) issues.push({ line: 1, what: `first line is ${first.length} characters (keep it under ${cap} so it clears the fold)` });
    if (kind === "caption" && text.length > 2200) issues.push({ line: 0, what: `caption is ${text.length} characters (keep it under 2,200)` });
  }
  if (issues.length) flagged++;
  results.push({ file: f, kind, issues });
}
if (o.json) console.log(JSON.stringify(results, null, 2));
else for (const r of results) {
  console.log(`${r.file}: ${r.issues.length ? `${r.issues.length} to fix` : "clean"}`);
  for (const i of r.issues) console.log(`  ${i.line ? `line ${i.line}: ` : ""}${i.what}`);
}
process.exit(flagged ? 1 : 0);
