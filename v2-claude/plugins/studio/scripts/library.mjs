#!/usr/bin/env node
// The member's material library (studio/library): plain markdown files, each with a short header, plus index.md (one
// line per file) so Claude can see what's there at a glance and grep for the rest.
//
//   node library.mjs import <studio-dir> <file ...> --type course|training|podcast-own|podcast-guest|post|email|testimonial|offer|notes
//                    [--title "..."] [--private] [--permission named|first-name|anonymous]
//   node library.mjs index <studio-dir>
//   node library.mjs search <studio-dir> <words ...> [--top 8] [--type training] [--no-private]
//
// import takes text-like files (.txt, .md, .srt, .vtt, .csv, .html); a Word file or a PDF is read by Claude first and
// saved as a .txt or .md. Every file gets this header:
//   ---
//   title: Pricing workshop, day 2
//   type: training
//   stage: own            # own (the member's own course, show or writing) or guest (the member on someone else's show)
//   private: false        # true: for understanding only, never quoted in anything public
//   permission:           # testimonials: named, first-name or anonymous
//   source: pricing-day2.txt
//   tags: [pricing, offers]
//   summary: One line on what's in it.
//   ---
import fs from "node:fs";
import path from "node:path";
import { args, die, findStudio, readText, exists, slug } from "./lib.mjs";

const o = args();
const [cmd, where, ...rest] = o._;
const studio = findStudio(where ?? process.cwd(), where);
if (!studio) die("No studio folder found. Run studio-setup first.");
const LIB = path.join(studio, "library");
fs.mkdirSync(LIB, { recursive: true });
const TYPES = ["course", "training", "podcast-own", "podcast-guest", "post", "email", "testimonial", "offer", "notes", "transcript", "faq", "story"];

function header(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const l of m[1].split("\n")) { const k = l.match(/^([a-z_]+):\s*(.*)$/i); if (k) meta[k[1].toLowerCase()] = k[2].trim(); }
  return { meta, body: text.slice(m[0].length) };
}
const files = () => {
  const out = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.md$/i.test(f) && f !== "index.md") out.push(p); } };
  walk(LIB);
  return out.sort();
};

function index() {
  const rows = files().map((f) => {
    const t = readText(f), { meta, body } = header(t);
    return { f: path.relative(LIB, f).split(path.sep).join("/"), title: meta.title || path.basename(f, ".md"), type: meta.type || "notes", stage: meta.stage || "own", priv: /^(true|yes)$/i.test(meta.private ?? ""), perm: meta.permission || "", words: body.split(/\s+/).filter(Boolean).length, summary: meta.summary || "" };
  });
  const cell = (s) => String(s).replace(/\|/g, "/");
  const lines = [
    "# Library index", "",
    "Every file in this folder, one line each. Built by library.mjs index; run it again after adding files.", "",
    "Rules: private files are for understanding only and are never quoted in anything public. guest files are the member on someone else's show: use them for stories and voice, never as the teaching itself. Testimonials are quoted word for word, with the name only as their permission allows.", "",
    "| File | Title | Type | Stage | Private | Words | Summary |", "|---|---|---|---|---|---|---|",
    ...rows.sort((x, y) => x.type.localeCompare(y.type) || x.title.localeCompare(y.title)).map((r) => `| ${cell(r.f)} | ${cell(r.title)} | ${r.type}${r.perm ? ` (${r.perm})` : ""} | ${r.stage} | ${r.priv ? "yes" : ""} | ${r.words} | ${cell(r.summary)} |`),
    "", `${rows.length} files, ${rows.reduce((a, r) => a + r.words, 0).toLocaleString("en-US")} words.`,
  ];
  fs.writeFileSync(path.join(LIB, "index.md"), lines.join("\n") + "\n");
  console.log(`index: ${path.join(LIB, "index.md")} (${rows.length} files)`);
}

switch (cmd) {
  case "import": {
    const type = TYPES.includes(o.type) ? o.type : die(`--type must be one of ${TYPES.join(", ")}`);
    if (!rest.length) die("Name the files to import.");
    for (const src of rest) {
      const raw = readText(path.resolve(src));
      if (!raw.trim()) { console.log(`skipped ${src}: empty, or not a text file (read Word and PDF files first and save them as .txt)`); continue; }
      let body = raw.replace(/\r/g, "");
      if (/\.(srt|vtt)$/i.test(src)) body = body.split(/\n\s*\n/).map((b) => b.split("\n").filter((l) => !/-->|^\d+$|^WEBVTT/.test(l.trim())).join(" ").replace(/<[^>]+>/g, "").trim()).filter(Boolean).join("\n");
      if (/\.html?$/i.test(src)) body = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<\/(p|div|h\d|li|br)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n");
      const title = rest.length === 1 && o.title ? o.title : path.basename(src).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      const stage = type === "podcast-guest" ? "guest" : "own";
      const name = `${type}-${slug(title, 6)}.md`;
      const dest = path.join(LIB, name);
      if (exists(dest) && !o.force) { console.log(`skipped ${src}: ${name} already exists (add --force to replace it)`); continue; }
      fs.writeFileSync(dest, `---\ntitle: ${title}\ntype: ${type}\nstage: ${stage}\nprivate: ${o.private ? "true" : "false"}\npermission: ${type === "testimonial" ? o.permission ?? "" : ""}\nsource: ${path.basename(src)}\ntags: []\nsummary:\n---\n\n${body.trim()}\n`);
      console.log(`imported ${src} -> library/${name}`);
    }
    index();
    break;
  }
  case "index": index(); break;
  case "search": {
    const terms = rest.map((t) => t.toLowerCase()).filter(Boolean);
    if (!terms.length) die("Give some words to search for.");
    const top = Number(o.top ?? 8);
    const hits = [];
    for (const f of files()) {
      const { meta, body } = header(readText(f));
      if (o.type && meta.type !== o.type) continue;
      if (o["no-private"] && /^(true|yes)$/i.test(meta.private ?? "")) continue;
      const low = body.toLowerCase();
      let score = 0;
      for (const t of terms) { const n = low.split(t).length - 1; score += n ? 1 + Math.log(1 + n) : 0; if ((meta.title ?? "").toLowerCase().includes(t)) score += 2; }
      if (!score) continue;
      const lines = body.split("\n").map((l, i) => ({ l, i: i + 1, n: terms.filter((t) => l.toLowerCase().includes(t)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 3);
      hits.push({ f: path.relative(studio, f), meta, score, lines });
    }
    hits.sort((a, b) => b.score - a.score);
    if (!hits.length) { console.log("No matches."); break; }
    for (const h of hits.slice(0, top)) {
      const flags = [h.meta.type, h.meta.stage === "guest" ? "GUEST: stories and voice only" : "", /^(true|yes)$/i.test(h.meta.private ?? "") ? "PRIVATE: never quote" : "", h.meta.permission ? `permission: ${h.meta.permission}` : ""].filter(Boolean).join(", ");
      console.log(`${h.f}  (${flags})  ${h.meta.title ?? ""}`);
      for (const x of h.lines) console.log(`  ${x.i}: ${x.l.trim().slice(0, 220)}`);
    }
    break;
  }
  default:
    die("Commands: import, index, search. See the top of library.mjs.");
}
