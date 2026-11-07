#!/usr/bin/env node
// Render a folder of HTML slides (one file per slide, rendered in name order; files starting with "_" are skipped) to
// PNGs with a headless browser, plus a contact sheet, and report any slide whose fit script found text that doesn't fit.
//
//   node render.mjs <slides-dir> [--out <png-dir>] [--size 1080x1350] [--only <name>] [--no-sheet] [--check]
import fs from "node:fs";
import path from "node:path";
import { args, die, needChrome, shoot, dumpDom, overflowOf, contactSheet, pool, exists } from "./lib.mjs";

const o = args();
const dir = o._[0] ? path.resolve(o._[0]) : die("Usage: node render.mjs <slides-dir> [--out dir] [--size 1080x1350] [--only name] [--no-sheet] [--check]");
if (!exists(dir)) die(`No folder at ${dir}`);
const out = path.resolve(o.out ?? path.join(dir, "..", "png"));
const [W, H] = String(o.size ?? "1080x1350").toLowerCase().split("x").map(Number);
fs.mkdirSync(out, { recursive: true });
let files = fs.readdirSync(dir).filter((f) => f.endsWith(".html") && !f.startsWith("_")).sort();
if (o.only) files = files.filter((f) => f.replace(/\.html$/, "") === o.only);
if (!files.length) die(`No slide HTML files in ${dir}`);
const c = needChrome();
const pngs = await pool(files, 3, async (f) => {
  const png = path.join(out, f.replace(/\.html$/, ".png"));
  await shoot(c, path.join(dir, f), png, W, H);
  console.log(`rendered ${path.basename(png)}`);
  return png;
});
if (o.check) {
  const over = (await pool(files, 3, async (f) => (overflowOf(await dumpDom(c, path.join(dir, f), W, H)) ? f.replace(/\.html$/, "") : null))).filter(Boolean);
  console.log(over.length ? `OVER: ${over.join(", ")} (text still runs past its box at the smallest size)` : "fit: every slide fits");
}
if (!o["no-sheet"] && pngs.length > 1) {
  const sheet = await contactSheet(c, pngs, path.join(out, "contact-sheet.png"), { ratio: H / W });
  console.log(`contact sheet: ${sheet}`);
}
console.log(`browser: ${c.path}`);
