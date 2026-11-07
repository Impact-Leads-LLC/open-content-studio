#!/usr/bin/env node
// A cover for a reel, TikTok, Short or story: 1080x1920, the cover line set large with one accent, every word inside the
// 3:4 window a profile grid shows (y 240 to 1680), over a still from the video, a picture, or the plain brand board.
//
//   node cover.mjs <cover.json> [--out cover.png] [--studio dir]
//   cover.json: { "line": "Your invoice is / the cash plan", "accent": "cash plan",
//                 "image": "thumb.jpg" | null, "focus_y": 35,
//                 "treatment": "fade" | "slab" | "board", "position": "top" | "bottom",
//                 "follow": "Follow for cash flow fixes" }
// "/" in the line sets a line break. Treatments: fade (a dark fade behind the words over the photo), slab (the words
// on a dark label), board (no photo: the brand colour with the dot grid). Put the words where the face isn't.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { args, die, findStudio, brand, fontCss, esc, escRaw, clean, needChrome, shoot, dumpDom, overflowOf, readJSON, resolveAsset, exists } from "./lib.mjs";

const o = args();
const src = o._[0] ? path.resolve(o._[0]) : die("Usage: node cover.mjs <cover.json> [--out cover.png] [--studio dir]");
const s = readJSON(src);
const studio = findStudio(path.dirname(src), o.studio);
const b = brand(studio), C = b.c;
const out = path.resolve(o.out ?? path.join(path.dirname(src), "cover.png"));
const imgFile = s.image ? resolveAsset(studio, s.image) ?? (exists(path.join(path.dirname(src), s.image)) ? path.join(path.dirname(src), s.image) : null) : null;
const treatment = imgFile ? (s.treatment === "slab" ? "slab" : s.treatment === "board" ? "board" : "fade") : "board";
const pos = s.position === "top" ? "top" : "bottom";
const lines = clean(s.line).split(/\s*\/\s*/).filter(Boolean);
const accent = clean(s.accent);
const mark = (t) => {
  const e = escRaw(t);
  if (!accent) return e;
  const i = t.toLowerCase().indexOf(accent.toLowerCase());
  if (i < 0) return e;
  const st = treatment === "board" || treatment === "slab" ? `color:${C.accent}` : `background:${C.accent};color:${C.on_accent};padding:0 .1em`;
  return `${escRaw(t.slice(0, i))}<span style="${st}">${escRaw(t.slice(i, i + accent.length))}</span>${escRaw(t.slice(i + accent.length))}`;
};
const words = lines.map((l) => `<div class="ln">${mark(l)}</div>`).join("");
const block = `<div id="hook" class="hook t-${treatment}">${words}${s.follow ? `<div class="follow">${esc(s.follow)}</div>` : ""}</div>`;
const bg = imgFile ? `background:#000 url('${pathToFileURL(imgFile).href}') 50% ${Math.max(0, Math.min(100, Number(s.focus_y ?? 35)))}% / cover no-repeat;` : `background:${C.board};${b.palette.dots ? "background-image:radial-gradient(rgba(255,255,255,.08) 2.4px, transparent 2.8px);background-size:40px 40px;" : ""}`;
const fade = treatment === "fade" ? `<div class="fade"></div>` : "";
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss(b)}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1080px; height: 1920px; overflow: hidden; }
body { ${bg} position: relative; -webkit-font-smoothing: antialiased; }
.fade { position: absolute; left: 0; right: 0; ${pos === "top" ? "top: 0; height: 1150px; background: linear-gradient(rgba(0,0,0,.78), rgba(0,0,0,.55) 55%, rgba(0,0,0,0));" : "bottom: 0; height: 1150px; background: linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.55) 45%, rgba(0,0,0,.82));"} }
.hook { position: absolute; left: 80px; right: 80px; ${pos === "top" ? "top: 300px;" : "bottom: 300px;"} font-family: '${b.fonts.head.family}', Arial, sans-serif; font-weight: 800; font-size: 128px; line-height: 1.02; letter-spacing: -.02em; color: #fff; }
.hook.t-slab { background: ${C.ink}; padding: 40px 44px; border-radius: 6px; left: 70px; right: 70px; }
.hook.t-board { ${pos === "top" ? "top: 360px;" : "bottom: 360px;"} }
.ln { margin-bottom: 6px; }
.follow { margin-top: 34px; font-family: '${b.fonts.body.family}', Arial, sans-serif; font-weight: 500; font-size: 40px; letter-spacing: 0; color: ${treatment === "board" ? C.mist : "#fff"}; }
</style></head><body>${fade}${block}
<script>
// keep every word inside the 3:4 window a profile grid shows (y 240 to 1680): step the type down until it fits
document.fonts.ready.then(function () {
  var el = document.getElementById('hook'), sizes = [118, 108, 98, 88, 80], i = 0;
  var bad = function () { var r = el.getBoundingClientRect(); return r.top < 240 || r.bottom > 1680 || el.scrollWidth > el.clientWidth + 1; };
  while (bad() && i < sizes.length) { el.style.fontSize = sizes[i++] + 'px'; }
  document.body.setAttribute('data-overflow', bad() ? '1' : '0');
});
</script></body></html>`;
const htmlFile = out.replace(/\.png$/i, ".html");
fs.writeFileSync(htmlFile, html);
const c = needChrome();
await shoot(c, htmlFile, out, 1080, 1920);
const over = overflowOf(await dumpDom(c, htmlFile, 1080, 1920));
console.log(`cover: ${out} (${treatment}, words at the ${pos})`);
console.log(over ? "OVER: the cover line doesn't fit; shorten it or move the break" : "fit: the cover line fits inside the grid window");
