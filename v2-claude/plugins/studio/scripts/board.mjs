#!/usr/bin/env node
// The review board: one self-contained HTML page (images inlined, no outside files) showing every piece of an episode by
// format and awareness level, with its slides, card or reel frames, its words, the coach's verdict and fixes, and the
// exact lines to say back to Claude to change it. Claude shows it as an artifact when the app can publish one, or it
// opens in any browser.
//
//   node board.mjs <episode-dir> [--out <file>] [--max-mb 14]
import fs from "node:fs";
import path from "node:path";
import { args, die, loadPieces, findStudio, brand, readJSON, readText, exists, jpeg, dataUri, escRaw, STAGES, STAGE_LABEL, clock } from "./lib.mjs";

const o = args();
const ep = o._[0] ? path.resolve(o._[0]) : die("Usage: node board.mjs <episode-dir> [--out file]");
const { data } = loadPieces(ep);
const studio = findStudio(ep, o.studio);
const b = brand(studio);
const out = path.resolve(o.out ?? path.join(ep, "review", "board.html"));
const thumbs = path.join(ep, "review", "thumbs");
fs.mkdirSync(thumbs, { recursive: true });
const coach = b.id.coach_name || `Coach ${b.id.first_name || ""}`.trim();
const first = b.id.first_name || "You";
const CHECKS = { stop: "Stop test", own: `${first} test`, truth: "Truth test", person: "Right person", fresh: "New each time", door: "Door test", lint: "Lint" };
const KIND = { reel: "Reel", carousel: "Carousel", post: "Post" };
let bytes = 0;

// an image as a small inline JPEG (the PNG itself when ffmpeg isn't there)
function img(file, width, alt) {
  if (!file || !exists(file)) return "";
  const key = path.relative(ep, file).replace(/[\\/]/g, "_").replace(/\.[a-z]+$/i, "");
  const small = path.join(thumbs, `${key}-${width}.jpg`);
  const use = (exists(small) && fs.statSync(small).mtimeMs >= fs.statSync(file).mtimeMs) || jpeg(file, small, width) ? small : file;
  const uri = dataUri(use);
  bytes += uri.length;
  return `<img src="${uri}" alt="${escRaw(alt)}" loading="lazy">`;
}
// the publishable words of post.md / caption.md (above the --- line) and the notes below it
function words(file) {
  const t = readText(file);
  if (!t.trim()) return null;
  const [body, ...meta] = t.split(/\n-{3,}\s*\n/);
  return { body: body.replace(/^# .*\n+/, "").trim(), meta: meta.join("\n").trim() };
}
const listPngs = (dir) => (exists(dir) ? fs.readdirSync(dir).filter((f) => /\.png$/i.test(f) && !/contact-sheet/.test(f)).sort().map((f) => path.join(dir, f)) : []);

const cards = [];
const counts = { reel: 0, carousel: 0, post: 0, ready: 0, fix: 0, rethink: 0, none: 0 };
const stageCount = Object.fromEntries([...STAGES, "none"].map((s) => [s, 0]));
for (const p of data.pieces) {
  if (p.status === "dropped") continue;
  const dir = path.join(ep, p.dir ?? "");
  const rv = readJSON(path.join(dir, "review.json"), null);
  const verdict = rv?.verdict ?? "none";
  counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  counts[verdict] = (counts[verdict] ?? 0) + 1;
  stageCount[p.stage ?? "none"]++;
  let media = "", note = "";
  if (p.kind === "reel") {
    const rj = readJSON(path.join(dir, "reel.json"), null);
    const cover = exists(path.join(dir, "cover.png")) ? img(path.join(dir, "cover.png"), 240, "cover") : "";
    const th = img(path.join(dir, "thumb.jpg"), 240, "first frame");
    const sheet = img(path.join(dir, "sheet.jpg"), 640, "a frame every 3 seconds");
    media = cover || th || sheet ? `<div class="strip reel">${cover}${th}${sheet ? `<span class="sheet">${sheet}</span>` : ""}</div>` : `<p class="empty">Not cut yet.</p>`;
    if (rj) note = `${rj.duration.toFixed(1)} s, cut ${rj.cut.from} to ${rj.cut.to}${rj.layout ? `, ${rj.layout}` : ""}. Watch it on your computer: <code>${escRaw(path.relative(ep, path.join(dir, "reel.mp4")))}</code>`;
  } else if (p.kind === "carousel") {
    const slides = listPngs(path.join(dir, "png"));
    const bj = readJSON(path.join(dir, "build.json"), null);
    media = slides.length ? `<div class="strip">${slides.map((s, i) => img(s, 300, `slide ${i + 1}`)).join("")}</div>` : `<p class="empty">Not built yet.</p>`;
    if (bj?.over?.length) note = `Text runs long on ${bj.over.join(", ")}.`;
    else if (slides.length) note = `${slides.length} slides.`;
  } else {
    const card = path.join(dir, "card.png");
    media = exists(card) ? `<div class="strip">${img(card, 300, "post graphic")}</div>` : "";
  }
  const w = words(path.join(dir, p.kind === "post" ? "post.md" : "caption.md"));
  const say = [
    `approve ${p.id}`,
    rv?.fixes?.length ? `${p.id}: use ${rv.fixes.length > 1 ? `fixes 1 to ${rv.fixes.length}` : "fix 1"}` : null,
    `${p.id}: change `,
    rv?.question ? `${p.id}: my take is ` : null,
    `drop ${p.id}`,
  ].filter(Boolean);
  const failed = (rv?.checks ?? []).filter((c) => !c.pass);
  const badges = [
    p.below_bar ? `<span class="badge warn">Under the usual bar</span>` : "",
    p.needs_take ? `<span class="badge warn">Needs your take</span>` : "",
    p.status === "approved" || p.status === "scheduled" || p.status === "posted" ? `<span class="badge ok">${p.status[0].toUpperCase()}${p.status.slice(1)}</span>` : "",
  ].join("");
  cards.push(`<article class="piece" data-kind="${p.kind}" data-stage="${p.stage ?? "none"}" data-verdict="${verdict}">
  <div class="top"><span class="id">${p.id}</span><span>${KIND[p.kind]}</span><span>${STAGE_LABEL[p.stage] ?? "No stage"}</span>${p.kind === "reel" && p.score != null ? `<span>Score ${p.score}</span>` : ""}<span class="v ${verdict}">${verdict === "none" ? "Not reviewed" : `${verdict[0].toUpperCase()}${verdict.slice(1)}${rv?.score != null ? ` ${rv.score}` : ""}`}</span>${badges}</div>
  <h2>${escRaw(p.title)}</h2>
  ${p.hook ? `<p class="hook">${escRaw(p.hook)}</p>` : ""}
  ${p.insight ? `<p class="small">Insight: ${escRaw(p.insight)}${p.start ? ` · from ${escRaw(p.start)}${p.end ? ` to ${escRaw(p.end)}` : ""}` : ""}${p.library?.length ? ` · built out with ${p.library.map(escRaw).join(", ")}` : ""}</p>` : ""}
  ${media}
  ${note ? `<p class="small">${note}</p>` : ""}
  ${w ? `<details${p.kind === "post" ? " open" : ""}><summary>${p.kind === "post" ? "The post" : "The caption"}</summary><div class="words">${escRaw(w.body)}</div>${w.meta ? `<div class="words meta">${escRaw(w.meta)}</div>` : ""}</details>` : `<p class="empty">No words yet.</p>`}
  ${rv ? `<div class="coach"><p class="said"><b>${escRaw(coach)}:</b> ${escRaw(rv.headline ?? "")}</p>
    ${failed.length ? `<ul class="checks">${failed.map((c) => `<li><b>${escRaw(CHECKS[c.id] ?? c.id)}</b> ${escRaw(c.note ?? "")}</li>`).join("")}</ul>` : `<p class="small">All seven checks pass.</p>`}
    ${rv.fixes?.length ? `<ol class="fixes">${rv.fixes.map((f) => `<li><b>${escRaw(f.where ?? "")}</b> ${escRaw(f.problem ?? "")}${f.before || f.after ? `<div class="ba">${f.before ? `<del>${escRaw(f.before)}</del>` : ""}${f.after ? `<ins>${escRaw(f.after)}</ins>` : ""}</div>` : ""}</li>`).join("")}</ol>` : ""}
    ${rv.question ? `<p class="q"><b>Question for you:</b> ${escRaw(rv.question)}</p>` : ""}
    ${rv.hooks?.length ? `<details><summary>Other first lines</summary><ul>${rv.hooks.map((h) => `<li>${escRaw(h)}</li>`).join("")}</ul></details>` : ""}</div>` : ""}
  <div class="say"><p>Say to Claude</p>${say.map((s) => `<div class="line"><code>${escRaw(s)}</code><button type="button" data-copy="${escRaw(s)}">Copy</button></div>`).join("")}</div>
</article>`);
}

// the planned slots, when the calendar has been made
let cal = "";
const csv = readText(path.join(ep, "calendar.csv"));
if (csv.trim()) {
  const rows = parseCsv(csv);
  const h = rows[0] ?? [], idx = (n) => h.indexOf(n);
  const seen = new Set();
  const body = rows.slice(1).filter((r) => { const k = r[idx("piece")]; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((r) => `<tr><td>${escRaw(r[idx("date")])}</td><td>${escRaw(r[idx("time")])}</td><td>${escRaw(r[idx("piece")])}</td><td>${escRaw(r[idx("kind")])}</td><td>${escRaw(r[idx("title")])}</td></tr>`).join("");
  cal = `<section class="cal"><h2>Posting plan</h2><p class="small">In ${escRaw(h.length ? rows[1]?.[idx("timezone")] ?? "" : "")} time. The file to import is <code>calendar.csv</code> in the episode folder.</p><div class="tablewrap"><table><thead><tr><th>Date</th><th>Time</th><th>Piece</th><th>Format</th><th>Title</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}
function parseCsv(t) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const n = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
const chip = (group, value, label, n) => `<button type="button" class="chip" data-group="${group}" data-value="${value}" aria-pressed="${value === "all"}">${label}${n !== undefined ? ` <span>${n}</span>` : ""}</button>`;
const accent = b.c.board;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review board</title>
<style>
:root { --bg: #f6f7f9; --card: #ffffff; --ink: #14202b; --text: #3b4752; --muted: #66727d; --line: #e2e7ec; --brand: ${accent}; --ok: #1d7a46; --okbg: #e3f4ea; --fix: #8a5a00; --fixbg: #fff3d6; --bad: #a3302a; --badbg: #fde6e4; --code: #eef2f5; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0f1418; --card: #172027; --ink: #eef3f6; --text: #c9d3da; --muted: #93a1ac; --line: #2a3640; --brand: #7fb3d5; --ok: #6fd39b; --okbg: #163526; --fix: #f2c46b; --fixbg: #3a2e12; --bad: #f19a92; --badbg: #3d1d1a; --code: #1f2a32; } }
:root[data-theme="dark"] { --bg: #0f1418; --card: #172027; --ink: #eef3f6; --text: #c9d3da; --muted: #93a1ac; --line: #2a3640; --brand: #7fb3d5; --ok: #6fd39b; --okbg: #163526; --fix: #f2c46b; --fixbg: #3a2e12; --bad: #f19a92; --badbg: #3d1d1a; --code: #1f2a32; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 28px 16px 64px; }
h1 { color: var(--ink); font-size: 28px; line-height: 1.2; margin: 0 0 6px; }
h2 { color: var(--ink); font-size: 19px; line-height: 1.3; margin: 10px 0 6px; }
.meta, .small { color: var(--muted); font-size: 14px; margin: 4px 0; }
.howto { background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--brand); border-radius: 8px; padding: 14px 16px; margin: 20px 0; }
.howto p { margin: 4px 0; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 6px; }
.chip { font: inherit; font-size: 14px; border: 1px solid var(--line); background: var(--card); color: var(--text); border-radius: 999px; padding: 5px 12px; cursor: pointer; }
.chip span { color: var(--muted); }
.chip[aria-pressed="true"] { background: var(--brand); border-color: var(--brand); color: #fff; }
.chip[aria-pressed="true"] span { color: rgba(255,255,255,.8); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 500px), 1fr)); gap: 16px; margin-top: 16px; }
.piece { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; min-width: 0; }
.top { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 13px; color: var(--muted); }
.id { font-weight: 700; color: var(--ink); background: var(--code); border-radius: 4px; padding: 1px 7px; }
.v { border-radius: 4px; padding: 1px 7px; font-weight: 600; }
.v.ready { color: var(--ok); background: var(--okbg); } .v.fix { color: var(--fix); background: var(--fixbg); } .v.rethink { color: var(--bad); background: var(--badbg); } .v.none { background: var(--code); }
.badge { border-radius: 4px; padding: 1px 7px; font-weight: 600; } .badge.warn { color: var(--fix); background: var(--fixbg); } .badge.ok { color: var(--ok); background: var(--okbg); }
.hook { color: var(--ink); font-weight: 600; margin: 4px 0 8px; }
.strip { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0 8px; scroll-snap-type: x proximity; }
.strip img { height: 220px; width: auto; border-radius: 6px; border: 1px solid var(--line); flex: none; scroll-snap-align: start; }
.strip.reel img { height: 260px; }
.strip .sheet img { height: auto; width: 420px; max-width: 80vw; }
.empty { color: var(--muted); font-style: italic; }
details { margin: 8px 0; } summary { cursor: pointer; color: var(--ink); font-weight: 600; }
.words { white-space: pre-wrap; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 12px; margin-top: 8px; font-size: 15px; overflow-wrap: anywhere; }
.words.meta { color: var(--muted); font-size: 13px; }
.coach { border-top: 1px solid var(--line); margin-top: 12px; padding-top: 10px; }
.coach .said { margin: 0 0 6px; }
.checks, .fixes { margin: 6px 0; padding-left: 20px; } .checks li, .fixes li { margin: 4px 0; }
.ba { margin-top: 4px; font-size: 14px; } .ba del { display: block; color: var(--bad); } .ba ins { display: block; color: var(--ok); text-decoration: none; }
.q { background: var(--fixbg); border-radius: 6px; padding: 8px 10px; }
.say { background: var(--code); border-radius: 8px; padding: 10px 12px; margin-top: 12px; }
.say p { margin: 0 0 6px; font-size: 13px; font-weight: 700; color: var(--ink); }
.say .line { display: flex; gap: 8px; align-items: center; margin: 4px 0; }
.say code { flex: 1; min-width: 0; font: 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--ink); overflow-wrap: anywhere; }
.say button { font: inherit; font-size: 13px; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 6px; padding: 3px 10px; cursor: pointer; }
.cal { margin-top: 32px; } .tablewrap { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: 14px; background: var(--card); }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); } th { color: var(--ink); }
code { background: var(--code); border-radius: 4px; padding: 0 4px; }
footer { margin-top: 32px; color: var(--muted); font-size: 13px; }
[hidden] { display: none !important; }
</style></head>
<body><div class="wrap">
<h1>${escRaw(data.episode.title)}</h1>
<p class="meta">${escRaw(data.episode.date)} · ${n(counts.reel, "reel")}, ${n(counts.carousel, "carousel")}, ${n(counts.post, "post")} · ${counts.ready} ready, ${counts.fix} to fix, ${counts.rethink} to rethink${counts.none ? `, ${counts.none} not reviewed` : ""}</p>
<div class="howto">
  <p><b>How to change a piece.</b> This page can't change your files. Copy a line from a piece's "Say to Claude" box, finish it in your own words, and paste it into the chat. Claude makes the change, checks it again and rebuilds this page.</p>
  <p class="small">For example: <code>approve r01 c02 p03</code> · <code>p03: shorter, and lead with the 60 days</code> · <code>c02: use fixes 1 to 3</code> · <code>drop p07</code> · <code>approve everything that's ready</code> · <code>posted r01 today</code></p>
</div>
<div class="filters" role="group" aria-label="Format">${chip("kind", "all", "All")}${chip("kind", "reel", "Reels", counts.reel)}${chip("kind", "carousel", "Carousels", counts.carousel)}${chip("kind", "post", "Posts", counts.post)}</div>
<div class="filters" role="group" aria-label="Awareness level">${chip("stage", "all", "Every level")}${STAGES.map((s) => chip("stage", s, STAGE_LABEL[s], stageCount[s])).join("")}${stageCount.none ? chip("stage", "none", "No stage", stageCount.none) : ""}</div>
<div class="filters" role="group" aria-label="Verdict">${chip("verdict", "all", "Any verdict")}${chip("verdict", "ready", "Ready", counts.ready)}${chip("verdict", "fix", "Fix", counts.fix)}${chip("verdict", "rethink", "Rethink", counts.rethink)}</div>
<main class="grid">
${cards.join("\n")}
</main>
${cal}
<footer>Built ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} from <code>${escRaw(path.basename(ep))}</code>. Ask Claude to rebuild the board after any change.</footer>
</div>
<script>
(function () {
  var state = { kind: "all", stage: "all", verdict: "all" };
  function apply() {
    document.querySelectorAll(".piece").forEach(function (el) {
      var show = ["kind", "stage", "verdict"].every(function (g) { return state[g] === "all" || el.dataset[g] === state[g]; });
      el.hidden = !show;
    });
  }
  document.querySelectorAll(".chip").forEach(function (b) {
    b.addEventListener("click", function () {
      state[b.dataset.group] = b.dataset.value;
      document.querySelectorAll('.chip[data-group="' + b.dataset.group + '"]').forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      apply();
    });
  });
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy"), done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); };
      var fallback = function () {
        var code = btn.previousElementSibling, r = document.createRange(); r.selectNodeContents(code);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = "Selected";
      };
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback(); } catch (e) { fallback(); }
    });
  });
})();
</script>
</body></html>`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
const mb = Buffer.byteLength(html) / 1048576;
console.log(`board: ${out} (${mb.toFixed(1)} MB, ${cards.length} pieces)`);
if (mb > Number(o["max-mb"] ?? 14)) console.log("note: over the artifact size limit; open it in the browser instead, or build one board per format with fewer slides.");
