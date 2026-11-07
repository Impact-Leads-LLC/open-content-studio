#!/usr/bin/env node
// Clearing heavy files once work is posted, by the rule set in setup (studio/brand/settings.json "retention"):
// a posted piece keeps its words (post.md, caption.md, plan.json, review.json, the slide HTML) and loses its renders
// (PNGs, JPEGs, MP4s, work files) a set number of days after posting; an episode's raw footage and work files go once
// every piece from it is posted or dropped and the same number of days have passed since the last post. Only copies
// inside the studio folder count as raw footage (episodes/<episode>/source/): a video left where it was is never
// touched. Nothing that isn't posted is ever touched. Dropped pieces' files are kept unless you add --include-dropped.
//
//   node cleanup.mjs <studio-dir> [--apply] [--include-dropped] [--now 2026-11-20]
//
// Without --apply it only lists what it would clear and how much space that frees: show the list and ask before
// running it again with --apply. "action": "delete" removes the files for good; "move" moves them to "move_to" (an
// archive folder, an external drive, or a synced Google Drive or Dropbox folder) under the same episode/piece names.
import fs from "node:fs";
import path from "node:path";
import { args, die, findStudio, brand, readJSON, writeJSON, exists } from "./lib.mjs";

const o = args();
const studio = findStudio(o._[0] ?? process.cwd(), o._[0]);
if (!studio) die("No studio folder found. Usage: node cleanup.mjs <studio-dir> [--apply]");
const b = brand(studio);
const R = b.settings.retention ?? {};
const days = Number(R.renders_days ?? 7), rawDays = Number(R.raw_days ?? days);
const action = R.action === "move" ? "move" : "delete";
const moveTo = action === "move" ? (R.move_to ? path.resolve(studio, R.move_to) : die('retention.action is "move" but retention.move_to is empty.')) : null;
const now = o.now ? Date.parse(o.now) : Date.now();
const HEAVY = /\.(png|jpe?g|webp|gif|mp4|mov|m4v|webm|mkv|wav|aiff?|mp3|m4a)$/i;
const MEDIA = /\.(mp4|mov|m4v|webm|mkv|wav|aiff?|mp3|m4a|flac)$/i;
const plan = [];
const add = (file, why) => { try { const s = fs.statSync(file); plan.push({ file, size: s.isDirectory() ? dirSize(file) : s.size, why }); } catch {} };
function dirSize(d) { let n = 0; for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); n += s.isDirectory() ? dirSize(p) : s.size; } return n; }
function heavyIn(dir, why, depth = 0) {
  if (!exists(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f), s = fs.statSync(p);
    if (s.isDirectory()) { if (f === "work") add(p, why); else if (depth < 3) heavyIn(p, why, depth + 1); }
    else if (HEAVY.test(f)) add(p, why);
  }
}

const eps = path.join(studio, "episodes");
const touched = [];
for (const d of exists(eps) ? fs.readdirSync(eps).sort() : []) {
  const ep = path.join(eps, d), f = path.join(ep, "pieces.json");
  if (!exists(f)) continue;
  const data = readJSON(f, null);
  if (!data) continue;
  let changed = false;
  for (const p of data.pieces ?? []) {
    const due = p.status === "posted" && p.posted_at && now - Date.parse(p.posted_at) >= days * 864e5;
    const dropped = o["include-dropped"] && p.status === "dropped";
    if (!(due || dropped) || p.cleared_at) continue;
    heavyIn(path.join(ep, p.dir), `${d}/${p.id} ${dropped ? "dropped" : `posted ${p.posted_at.slice(0, 10)}`}`);
    for (const t of exists(path.join(ep, "to-post")) ? fs.readdirSync(path.join(ep, "to-post")).filter((x) => x.includes(`_${p.id}-`)) : []) add(path.join(ep, "to-post", t), `${d}/${p.id} posting folder`);
    p.cleared_pending = true;
    changed = true;
  }
  // the episode's raw footage and work files: once everything from it is posted or dropped
  const ps = data.pieces ?? [];
  const done = ps.length > 0 && ps.every((p) => ["posted", "dropped"].includes(p.status));
  const lastPost = Math.max(0, ...ps.filter((p) => p.posted_at).map((p) => Date.parse(p.posted_at)));
  if (R.raw_footage !== "keep" && done && lastPost && now - lastPost >= rawDays * 864e5 && !data.episode.raw_cleared_at) {
    for (const sub of ["source", "work", "review/thumbs"]) {
      const dir = path.join(ep, sub);
      if (!exists(dir)) continue;
      for (const f2 of fs.readdirSync(dir)) { const p2 = path.join(dir, f2); if (sub !== "source" || MEDIA.test(f2)) add(p2, `${d} raw footage and work files (every piece posted or dropped)`); }
    }
    data.episode.raw_pending = true;
    changed = true;
  }
  if (changed) touched.push({ f, data, ep });
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const totalSize = plan.reduce((a, x) => a + x.size, 0);
if (!plan.length) { console.log(`Nothing to clear. Rule: renders ${days} days after posting${R.raw_footage === "keep" ? ", raw footage kept" : `, raw footage ${rawDays} days after the last post once every piece is posted or dropped`}.`); process.exit(0); }
console.log(`${o.apply ? "Clearing" : "Would clear"} ${plan.length} items, ${mb(totalSize)} (${action === "move" ? `moved to ${moveTo}` : "deleted for good"}):`);
const byWhy = new Map();
for (const x of plan) { const k = x.why; byWhy.set(k, [...(byWhy.get(k) ?? []), x]); }
for (const [why, xs] of byWhy) console.log(`  ${why}: ${xs.length} file${xs.length === 1 ? "" : "s"}, ${mb(xs.reduce((a, x) => a + x.size, 0))}`);
if (!o.apply) { console.log("Nothing changed. Run again with --apply to do it."); process.exit(0); }

for (const x of plan) {
  if (action === "move") {
    const dest = path.join(moveTo, path.relative(eps, x.file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try { fs.renameSync(x.file, dest); } catch { fs.cpSync(x.file, dest, { recursive: true }); fs.rmSync(x.file, { recursive: true, force: true }); }
  } else fs.rmSync(x.file, { recursive: true, force: true });
}
const stamp = new Date(now).toISOString();
for (const t of touched) {
  for (const p of t.data.pieces) if (p.cleared_pending) { delete p.cleared_pending; p.cleared_at = stamp; (p.history ??= []).push({ at: stamp, note: `renders ${action === "move" ? "moved" : "deleted"}` }); }
  if (t.data.episode.raw_pending) { delete t.data.episode.raw_pending; t.data.episode.raw_cleared_at = stamp; }
  writeJSON(t.f, t.data);
}
console.log(`Done: ${mb(totalSize)} ${action === "move" ? "moved" : "freed"}. The words, plans and reviews are all still there.`);
