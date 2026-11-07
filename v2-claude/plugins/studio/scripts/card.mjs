#!/usr/bin/env node
// The graphic that goes out with a text post: one 1080x1350 card with the post's point in big type, in the member's
// look. Two looks take turns so the feed doesn't repeat: "board" (the brand colour, white type, the key word in the
// accent colour) and "light" (a light ground, dark type, the key word on an accent mark). The accent is for the one key
// word only.
//
//   node card.mjs <card.json> [--out card.png] [--studio dir]
//   card.json: { "line": "Invoice on the *first day* of the project", "look": "board" | "light", "label": "" }
//
// The line is the post's point in 4 to 12 words, the key word or number wrapped in *asterisks*.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, die, findStudio, brand, fontCss, esc, keyWords, needChrome, shoot, dumpDom, overflowOf, readJSON } from "./lib.mjs";

const o = args();
const src = o._[0] ? path.resolve(o._[0]) : die("Usage: node card.mjs <card.json> [--out card.png] [--studio dir]");
const spec = readJSON(src);
if (!String(spec.line ?? "").trim()) die("card.json has no line.");
const studio = findStudio(path.dirname(src), o.studio);
const b = brand(studio), C = b.c;
const out = path.resolve(o.out ?? path.join(path.dirname(src), "card.png"));
const look = spec.look === "light" ? "light" : "board";
const words = keyWords(spec.line);
const chars = words.reduce((a, x) => a + x.w.length + 1, 0);
// big for a few words, smaller as the line runs long
const size = words.length <= 4 && chars <= 26 ? 150 : words.length <= 7 && chars <= 46 ? 118 : words.length <= 10 && chars <= 64 ? 98 : chars <= 90 ? 84 : 72;
const board = look === "board";
const fg = board ? "#ffffff" : C.ink, sub = board ? C.mist : C.text;
const gap = Math.round(size * 0.26);
const spans = words.map((x, i) => {
  const right = words[i + 1]?.glue ? 0 : gap;
  const st = x.key
    ? board ? `color:${C.accent};margin-right:${right}px` : `background:${C.accent};color:${C.on_accent};padding:0 ${Math.round(size * 0.08)}px;margin-right:${right ? Math.round(gap * 0.7) : 0}px`
    : `margin-right:${right}px`;
  return `<span style="${st};margin-bottom:${Math.round(size * 0.1)}px">${esc(x.w)}</span>`;
}).join("");
const dots = b.palette.dots ? `background-image:radial-gradient(${board ? "rgba(255,255,255,.09)" : "rgba(12,26,36,.09)"} 2.4px, transparent 2.8px);background-size:38px 38px;` : "";
const who = b.headshot ? `<img src="${pathToFileURL(b.headshot).href}" style="width:128px;height:128px;border-radius:64px;border:5px solid ${board ? "#fff" : C.ink};object-fit:cover;margin-right:26px">` : "";
const logo = !b.headshot && b.logo ? `<img src="${pathToFileURL(b.logo).href}" style="height:88px;max-width:260px;object-fit:contain;margin-right:26px">` : "";
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss(b)}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1080px; height: 1350px; overflow: hidden; }
body { background: ${board ? C.board : C.soft}; ${dots} display: flex; flex-direction: column; padding: 96px 88px 84px; font-family: '${b.fonts.body.family}', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.label { align-self: flex-start; background: ${C.chip}; color: #fff; font-family: '${b.fonts.head.family}', Arial, sans-serif; font-weight: 900; font-size: 26px; letter-spacing: 1.8px; text-transform: uppercase; padding: 14px 22px; border-radius: 6px; }
.mid { flex: 1; display: flex; align-items: center; }
.line { display: flex; flex-wrap: wrap; font-family: '${b.fonts.head.family}', Arial, sans-serif; font-weight: 900; font-size: ${size}px; line-height: 1; letter-spacing: ${-size * 0.025}px; text-transform: uppercase; color: ${fg}; }
.foot { display: flex; align-items: center; justify-content: space-between; }
.me { display: flex; align-items: center; }
.name { font-weight: 600; font-size: 34px; color: ${fg}; }
.sub { font-weight: 400; font-size: 26px; color: ${sub}; }
</style></head><body>
${spec.label ? `<div class="label">${esc(spec.label)}</div>` : ""}
<div class="mid"><div class="line" data-h="1130" data-sizes="${[size - 10, size - 20, size - 30].filter((x) => x >= 60).join(",")}">${spans}</div></div>
<div class="foot"><div class="me">${who}${logo}<div><div class="name">${esc(b.id.name)}</div>${b.id.name_line ? `<div class="sub">${esc(b.id.name_line)}</div>` : ""}</div></div><div class="sub">${esc(b.id.handle)}</div></div>
<script>
document.fonts.ready.then(function () {
  var el = document.querySelector('.line'), foot = document.querySelector('.foot').getBoundingClientRect().top - 40;
  var sizes = (el.dataset.sizes || '').split(',').map(Number).filter(Boolean), i = 0;
  // a short word left alone on a line ("IN") reads as a mistake: step the type down until it joins a line
  function lone() {
    var rows = {}, s = el.children;
    for (var k = 0; k < s.length; k++) { var t = s[k].offsetTop; (rows[t] = rows[t] || []).push(s[k].textContent); }
    return Object.keys(rows).some(function (t) { return rows[t].length === 1 && rows[t][0].length <= 3; });
  }
  while ((el.getBoundingClientRect().bottom > foot || lone()) && i < sizes.length) { el.style.fontSize = sizes[i++] + 'px'; }
  document.body.setAttribute('data-overflow', el.getBoundingClientRect().bottom > foot || el.scrollWidth > el.clientWidth + 1 ? '1' : '0');
});
</script></body></html>`;
const htmlFile = out.replace(/\.png$/i, ".html");
fs.writeFileSync(htmlFile, html);
const c = needChrome();
await shoot(c, htmlFile, out, 1080, 1350);
const over = overflowOf(await dumpDom(c, htmlFile, 1080, 1350));
console.log(`card: ${out} (${look})`);
console.log(over ? "OVER: the line doesn't fit at the smallest size; shorten it" : "fit: the line fits");
