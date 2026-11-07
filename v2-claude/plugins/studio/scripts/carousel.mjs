#!/usr/bin/env node
// Story carousels: a cover with the hook, plain reading slides with one bold line each and a save pill on slide 3 or 4,
// and the outro (the next step, save, follow). 1080x1350, 10 slides at most. Claude writes plan.json (the words only);
// this script draws every slide in the member's look, renders them with a headless browser and checks the fit.
//
//   node carousel.mjs <deck-dir> [--studio <studio-dir>] [--no-render]
//
// <deck-dir>/plan.json:
// { "format": "story" | "custom",
//   "chip": "Episode 12",                       // small label on the cover: the show, "Expert guest", the brand...
//   "cover": { "top": "Most studio owners", "key": "pay late", "bottom": "and lose the month",
//              "sticker": "The three-account fix", "image": "cover.jpg", "focus_x": 50, "focus_y": 40 },
//   "slides": [ { "blocks": [ { "kind": "p" | "bold" | "quote" | "step", "text": "..." } ] } ],   // 6 to 8
//   "save_slide": 3, "save_text": "Save this for your next invoice day",
//   "outro_headline": "Want your cash to feel calm?", "follow_topic": "cash flow fixes", "credit": "" }
// "custom": Claude has written its own slides into <deck>/slides (linking ../kit.css); the outro is added and all render.
//
// Writes slides/*.html, png/*.png, png/contact-sheet.png, copy.md (every visible word, for the voice check), kit.css and
// build.json ({ over: [...] }: slides whose text still runs past its box at the smallest size; rewrite those shorter).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, die, findStudio, brand, fontCss, esc, clean, needChrome, shoot, dumpDom, overflowOf, contactSheet, pool, readJSON, writeJSON, exists, probe, resolveAsset, FIT } from "./lib.mjs";

const o = args();
const deck = o._[0] ? path.resolve(o._[0]) : die("Usage: node carousel.mjs <deck-dir> [--studio dir] [--no-render]");
const plan = readJSON(path.join(deck, "plan.json"));
const studio = findStudio(deck, o.studio);
const b = brand(studio);
const C = b.c;
const SLIDES = path.join(deck, "slides"), PNG = path.join(deck, "png");
fs.mkdirSync(SLIDES, { recursive: true });
const MAX = 10;
const custom = plan.format === "custom";

// the look, as CSS the custom slides can use too
const KITCSS = `${fontCss(b)}
:root { --board: ${C.board}; --accent: ${C.accent}; --ink: ${C.ink}; --text: ${C.text}; --soft: ${C.soft}; --mist: ${C.mist}; --deep: ${C.deep}; --on-accent: ${C.on_accent}; --chip: ${C.chip};
  --head: '${b.fonts.head.family}', Arial, sans-serif; --body: '${b.fonts.body.family}', Arial, sans-serif; --m: 88px; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1080px; height: 1350px; overflow: hidden; }
body { position: relative; background: var(--soft); color: var(--text); font-family: var(--body); font-size: 34px; line-height: 1.4; -webkit-font-smoothing: antialiased; }
body.board { background: var(--board); color: #fff; }
.abs { position: absolute; }
.pad { position: absolute; left: var(--m); right: var(--m); }
.h1 { font-family: var(--head); font-weight: 800; font-size: 96px; line-height: 1.02; letter-spacing: -.025em; color: var(--ink); }
.h2 { font-family: var(--head); font-weight: 800; font-size: 64px; line-height: 1.08; letter-spacing: -.02em; color: var(--ink); }
body.board .h1, body.board .h2 { color: #fff; }
.key { color: var(--accent); }
.mark { background: var(--accent); color: var(--on-accent); padding: 0 .12em; }
.card { background: #fff; border-radius: 6px; padding: 52px; color: var(--ink); box-shadow: 0 24px 60px rgba(0,0,0,.18); }
.dots { background-image: radial-gradient(rgba(255,255,255,.075) 2.2px, transparent 2.6px); background-size: 38px 38px; }
.txt { position: absolute; left: 96px; right: 96px; top: 150px; font-size: 58px; line-height: 1.3; letter-spacing: -.01em; }
.txt p { margin-bottom: 48px; }
.txt b { color: var(--ink); font-weight: 600; }
.txt .say { color: var(--ink); font-weight: 500; }
.txt .n { display: grid; grid-template-columns: 1.4em 1fr; margin-bottom: 40px; }
.txt .n i { font-style: normal; font-family: var(--head); font-weight: 800; color: var(--deep); }
.foot2 { position: absolute; left: 96px; right: 96px; bottom: 70px; display: flex; justify-content: space-between; align-items: center; font-size: 24px; }
.foot2 .go { display: flex; align-items: center; gap: 18px; }
.save { position: absolute; left: 96px; bottom: 170px; border: 3px solid var(--ink); border-radius: 6px; padding: 18px 28px; font-size: 32px; color: var(--ink); font-weight: 500; }
.chip2 { position: absolute; left: 80px; top: 84px; background: var(--chip); color: #fff; font-family: var(--head); font-weight: 800; font-size: 26px; letter-spacing: .07em; text-transform: uppercase; padding: 14px 22px; border-radius: 6px; }
.one { white-space: nowrap; overflow: hidden; }
`;
fs.writeFileSync(path.join(deck, "kit.css"), KITCSS);

const ARROW = `<svg width="56" height="28" viewBox="0 0 56 28"><path d="M2 14h48M38 3l12 11-12 11" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const head = (cls = "") => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../kit.css"></head><body class="${cls}">`;
const handle = esc(b.id.handle);

function coverImage() {
  const c = plan.cover ?? {};
  if (!c.image) return null;
  const f = resolveAsset(studio, c.image) ?? (exists(path.join(deck, c.image)) ? path.join(deck, c.image) : null);
  if (!f) { console.log(`note: the cover image ${c.image} wasn't found, so the cover sets the hook larger`); return null; }
  let w = 1085;
  try { w = probe(f).width || 1085; } catch {}
  return { url: pathToFileURL(f).href, w };
}

function cover(total) {
  const c = plan.cover ?? {};
  const line = (t, size) => (t ? `<div class="one" data-w data-min="44" style="font-family:var(--head);font-weight:800;font-size:${size}px;line-height:1.05;letter-spacing:-.02em">${esc(t)}</div>` : "");
  const big = (size) => `<div class="one" data-w data-min="80" style="font-family:var(--head);font-weight:900;font-size:${size}px;line-height:.95;letter-spacing:-.03em;text-transform:uppercase;color:var(--accent);margin:16px 0 12px">${esc(c.key)}</div>`;
  const sticker = (top) => (c.sticker ? `<div class="abs" style="right:70px;top:${top}px;transform:rotate(3deg);background:#fff;color:var(--ink);border:4px solid var(--chip);box-shadow:10px 10px 0 var(--chip);padding:22px 30px;font-family:var(--head);font-weight:800;font-size:40px;line-height:1.1;max-width:640px;text-wrap:balance">${esc(c.sticker)}</div>` : "");
  const img = coverImage();
  let body;
  if (img) {
    // the picture fills the window at its own size or smaller: a crop, never blown up
    const bw = Math.min(1085, img.w), fx = Math.max(0, Math.min(100, Number(c.focus_x ?? 50))), fy = Math.max(0, Math.min(100, Number(c.focus_y ?? 40)));
    body = `<div class="abs" style="left:80px;right:80px;top:180px">${line(c.top, 72)}${big(134)}${line(c.bottom, 72)}</div>
<div class="abs" style="left:96px;top:580px;transform:rotate(-2deg)"><div style="width:780px;height:543px;border:14px solid #fff;box-shadow:18px 18px 0 var(--chip);background:#000 url('${img.url}') ${fx}% ${fy}% / ${bw}px auto no-repeat"></div></div>
${sticker(1060)}`;
  } else {
    body = `<div class="abs" style="left:80px;right:80px;top:360px">${line(c.top, 92)}${big(176)}${line(c.bottom, 92)}</div>
${sticker(900)}`;
  }
  return `${head(`board${b.palette.dots ? " dots" : ""}`)}
${plan.chip ? `<div class="chip2">${esc(plan.chip)}</div>` : ""}
${body}
<div class="foot2" style="color:var(--mist)"><div style="font-weight:500">${handle}</div><div class="go">${ARROW}</div></div>
${FIT}</body></html>`;
}

let stepN = 0;
function reading(blocks, n, total, save) {
  const out = [];
  for (const k of blocks) {
    const t = esc(k.text);
    if (!t) continue;
    if (k.kind === "step") { out.push(`<div class="n"><i>${++stepN}</i><div>${t}</div></div>`); continue; }
    out.push(k.kind === "bold" ? `<p><b>${t}</b></p>` : k.kind === "quote" ? `<p><span class="say">${t}</span></p>` : `<p>${t}</p>`);
  }
  const credit = clean(plan.credit);
  return `${head()}
<div class="txt" data-h="1140" data-stop="${save ? "#save" : ".foot2"}" data-sizes="54,50,46,44">${out.join("\n")}</div>
${save ? `<div class="save" id="save">${esc(save)}</div>` : ""}
<div class="foot2" style="color:#5f6b76"><div>${handle}${credit ? `${handle ? " &middot; " : ""}with ${esc(credit)}` : ""}</div><div class="go" style="color:var(--deep)"><span style="color:#5f6b76">${n} / ${total}</span>${ARROW}</div></div>
${FIT}</body></html>`;
}

function outro(total) {
  const headline = esc(plan.outro_headline || "Want help with this?");
  const topic = clean(plan.follow_topic).replace(/^more\s+/i, "").replace(/\s+like this\.?$/i, "") || "ideas";
  const who = b.headshot ? `<img src="${pathToFileURL(b.headshot).href}" style="width:132px;height:132px;border-radius:50%;object-fit:cover">` : "";
  const cl = clean(b.next.cta_label).length, ctaSize = cl <= 24 ? 56 : cl <= 32 ? 50 : cl <= 40 ? 44 : 38;
  const follow = b.id.handle ? `Follow ${esc(b.id.handle)} for more ${esc(topic)} like this.` : `Follow for more ${esc(topic)} like this.`;
  return `${head(`board${b.palette.dots ? " dots" : ""}`)}
<div class="abs" style="left:80px;top:96px;display:flex;align-items:center;gap:26px">${who}
  <div style="font-size:30px;line-height:1.3;color:var(--mist)"><b style="font-weight:600;color:#fff">${esc(b.id.name)}</b>${b.id.name_line ? `<br>${esc(b.id.name_line)}` : ""}</div>
</div>
<div class="abs" id="oh" data-h="650" data-sizes="84,76,68" style="left:80px;right:80px;top:300px;font-family:var(--head);font-weight:800;font-size:92px;line-height:1.02;letter-spacing:-.03em">${headline}</div>
<div class="abs" style="left:80px;right:92px;top:700px;background:var(--accent);color:var(--on-accent);border:4px solid var(--ink);box-shadow:12px 12px 0 var(--ink);padding:36px 44px">
  <div style="font-family:var(--head);font-weight:800;font-size:${ctaSize}px;line-height:1.08;text-wrap:balance">${esc(b.next.cta_label)}</div>
  ${b.next.cta_where ? `<div style="font-size:34px;margin-top:14px;font-weight:600">${esc(b.next.cta_where)}</div>` : ""}
</div>
<div class="abs" data-h="1215" data-sizes="32,30" style="left:80px;right:80px;top:1010px;font-size:34px;line-height:1.45;font-weight:500;color:var(--mist);text-wrap:balance">
  <div>Save this post for later.</div>
  <div>${follow}</div>
</div>
<div class="foot2" style="color:var(--mist)"><div style="font-weight:500">${handle}</div><div class="go"><span>${total} / ${total}</span></div></div>
${FIT}</body></html>`;
}

// ---- write ------------------------------------------------------------------------------------------------------------
let deckFiles = [];
const copy = [];
if (custom) {
  for (const f of fs.readdirSync(SLIDES)) if (/-outro\.html$/.test(f)) fs.unlinkSync(path.join(SLIDES, f));
  const mine = fs.readdirSync(SLIDES).filter((f) => f.endsWith(".html") && !f.startsWith("_")).sort().slice(0, MAX - 1);
  if (mine.length < 2) die("A custom carousel needs at least two slides of its own in slides/ (each linking ../kit.css).");
  const total = mine.length + 1, name = `${String(total).padStart(2, "0")}-outro`;
  fs.writeFileSync(path.join(SLIDES, `${name}.html`), outro(total));
  deckFiles = [...mine.map((f) => f.replace(/\.html$/, "")), name];
  copy.push("(custom slides: their copy is in their HTML)", `${name}: ${clean(plan.outro_headline)} | ${b.next.cta_label} | Save this post for later.`);
} else {
  const reads = (plan.slides ?? []).filter((s) => (s.blocks ?? []).some((k) => clean(k.text)));
  if (!reads.length) die("plan.json has no reading slides (slides[].blocks).");
  if (reads.length > MAX - 2) console.log(`note: ${reads.length} reading slides is more than ${MAX - 2}; the last ${reads.length - (MAX - 2)} were left out (10 slides at most)`);
  const use = reads.slice(0, MAX - 2), total = use.length + 2;
  const saveAt = Math.max(3, Math.min(4, Number(plan.save_slide) || 3, total - 1));
  let saveText = clean(plan.save_text);
  if (!/^save this/i.test(saveText)) saveText = saveText ? `Save this for ${saveText.replace(/^for\s+/i, "")}` : "Save this for later";
  for (const f of fs.readdirSync(SLIDES)) if (f.endsWith(".html")) fs.unlinkSync(path.join(SLIDES, f));
  stepN = 0;
  const put = (name, html) => { fs.writeFileSync(path.join(SLIDES, `${name}.html`), html); deckFiles.push(name); };
  put("01-cover", cover(total));
  const c = plan.cover ?? {};
  copy.push(`01-cover: ${[plan.chip, c.top, c.key, c.bottom, c.sticker].map(clean).filter(Boolean).join(" | ")}`);
  use.forEach((s, i) => {
    const n = i + 2, name = `${String(n).padStart(2, "0")}-read`;
    put(name, reading(s.blocks ?? [], n, total, n === saveAt ? saveText : ""));
    copy.push(`${name}: ${[...(s.blocks ?? []).map((k) => clean(k.text)), n === saveAt ? saveText : ""].filter(Boolean).join(" | ")}`);
  });
  const last = `${String(total).padStart(2, "0")}-outro`;
  put(last, outro(total));
  copy.push(`${last}: ${[clean(plan.outro_headline), b.next.cta_label, b.next.cta_where, "Save this post for later.", `Follow ${b.id.handle ? `${b.id.handle} ` : ""}for more ${clean(plan.follow_topic) || "ideas"} like this.`].filter(Boolean).join(" | ")}`);
}
fs.writeFileSync(path.join(deck, "copy.md"), `# Visible copy, slide by slide\n\n${copy.map((l) => `- ${l}`).join("\n")}\n`);
console.log(`slides written: ${deckFiles.length} (${custom ? "custom + outro" : "story"})`);
if (o["no-render"]) process.exit(0);

// ---- render, then check the fit ----------------------------------------------------------------------------------------
const chrome = needChrome();
fs.rmSync(PNG, { recursive: true, force: true });
fs.mkdirSync(PNG, { recursive: true });
const pngs = await pool(deckFiles, 3, async (n) => { const p = path.join(PNG, `${n}.png`); await shoot(chrome, path.join(SLIDES, `${n}.html`), p, 1080, 1350); return p; });
const over = (await pool(deckFiles, 3, async (n) => (overflowOf(await dumpDom(chrome, path.join(SLIDES, `${n}.html`), 1080, 1350)) ? n : null))).filter(Boolean);
await contactSheet(chrome, pngs, path.join(PNG, "contact-sheet.png"));
writeJSON(path.join(deck, "build.json"), { at: new Date().toISOString(), slides: deckFiles, over, browser: chrome.path });
console.log(`rendered ${pngs.length} slides to ${PNG}`);
console.log(over.length ? `OVER: ${over.join(", ")} (rewrite these shorter, same meaning, then run again)` : "fit: every slide fits");
