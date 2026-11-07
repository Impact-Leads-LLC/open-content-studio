#!/usr/bin/env node
// The posting calendar: gives every ready or approved piece the next open slot in the member's rhythm and time zone
// (studio/brand/rhythm.json), keeps the slots other episodes already hold, and writes calendar.csv in the episode folder:
// one row per piece per network, with the caption fitted to that network's limit and the save line in place.
//
//   node calendar.mjs <episode-dir> [--from 2026-11-10] [--statuses ready,approved,scheduled] [--reschedule] [--folders]
//
// When studio/brand/settings.json names a scheduler template (the CSV your scheduler gives you to fill in, saved in
// studio/brand/), it also writes calendar-<scheduler>.csv with that template's own columns filled in.
// --folders also copies each piece's files and text into to-post/<date>_<time>_<id>/, ready to drag into any scheduler.
import fs from "node:fs";
import path from "node:path";
import { args, die, loadPieces, findStudio, brand, readJSON, writeJSON, readText, exists, STAGES } from "./lib.mjs";

const o = args();
const ep = o._[0] ? path.resolve(o._[0]) : die("Usage: node calendar.mjs <episode-dir> [--from YYYY-MM-DD] [--reschedule] [--folders]");
const { file, data } = loadPieces(ep);
const studio = findStudio(ep, o.studio);
const b = brand(studio);
const R = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, slots: ["09:00", "12:00", "17:00"], per_day: { reel: 1, carousel: 1, post: 1 }, days: {}, reserved: [], ...(b.rhythm ?? {}) };
const TZ = R.timezone;
try { new Intl.DateTimeFormat("en-US", { timeZone: TZ }); } catch { die(`rhythm.json has a time zone the computer doesn't know: ${TZ} (use a name like America/Chicago or Europe/London).`); }
const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const daysFor = (kind) => (R.days?.[kind]?.length ? R.days[kind].map((d) => String(d).slice(0, 3).toLowerCase()) : WD);
const statuses = String(o.statuses ?? "ready,approved,scheduled").split(",");
const LIMIT = { threads: 500, x: 280, twitter: 280, bluesky: 300, pinterest: 500, instagram: 2200, tiktok: 2200, linkedin: 3000, facebook: 5000, youtube: 5000, gbp: 1500 };

// ---- time zones without a library ------------------------------------------------------------------------------------
const parts = (t, tz) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
function zoned(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m, d, h, min);
  const off = (t) => { const p = parts(t, tz); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t; };
  return guess - off(guess - off(guess));
}
const dayOf = (t) => { const p = parts(t, TZ); return `${p.year}-${p.month}-${p.day}`; };
const hhmm = (t) => { const p = parts(t, TZ); return `${p.hour}:${p.minute}`; };

// ---- the slots already held ------------------------------------------------------------------------------------------
const heldSlots = new Set(), heldKinds = new Map();
const hold = (kind, t) => { const d = dayOf(t); heldSlots.add(`${d} ${hhmm(t)}`); if (!heldKinds.has(d)) heldKinds.set(d, {}); heldKinds.get(d)[kind] = (heldKinds.get(d)[kind] ?? 0) + 1; };
const mine = data.pieces.filter((p) => statuses.includes(p.status));
const redo = new Set(o.reschedule ? mine.map((p) => p.id) : []);
const epsDir = studio ? path.join(studio, "episodes") : null;
for (const d of epsDir && exists(epsDir) ? fs.readdirSync(epsDir) : []) {
  const f = path.join(epsDir, d, "pieces.json");
  if (!exists(f)) continue;
  const j = path.resolve(f) === path.resolve(file) ? data : readJSON(f, null);
  for (const p of j?.pieces ?? []) {
    if (!p.scheduled_at || p.status === "dropped") continue;
    if (j === data && redo.has(p.id)) continue;
    hold(p.kind, Date.parse(p.scheduled_at));
  }
}

// ---- give each piece the next open slot ------------------------------------------------------------------------------
const today = parts(Date.now(), TZ);
const [fy, fm, fd] = (o.from ? String(o.from) : `${today.year}-${today.month}-${today.day}`).split("-").map(Number);
const startDay = o.from ? 0 : 1; // from tomorrow unless a start date is given
const reserved = (R.reserved ?? []).map((r) => ({ day: String(r.day).slice(0, 3).toLowerCase(), time: r.time }));
function nextSlot(kind) {
  const per = R.per_day?.[kind] ?? 1;
  for (let i = startDay; i < 400; i++) {
    const wd = WD[new Date(Date.UTC(fy, fm - 1, fd + i)).getUTCDay()];
    if (!daysFor(kind).includes(wd)) continue;
    const day = new Date(Date.UTC(fy, fm - 1, fd + i)).toISOString().slice(0, 10);
    if ((heldKinds.get(day)?.[kind] ?? 0) >= per) continue;
    for (const s of R.slots) {
      if (reserved.some((r) => r.day === wd && r.time === s)) continue;
      const [h, m] = s.split(":").map(Number);
      const t = zoned(fy, fm - 1, fd + i, h, m, TZ);
      if (t < Date.now() + 15 * 60000 || heldSlots.has(`${dayOf(t)} ${hhmm(t)}`)) continue;
      return t;
    }
  }
  return null;
}
// each kind in turn through the levels, so a week mixes unaware, problem, solution, product and most-aware pieces
const queue = (kind) => {
  const ps = mine.filter((p) => p.kind === kind && (!p.scheduled_at || redo.has(p.id)));
  const by = STAGES.map((s) => ps.filter((p) => p.stage === s).sort((x, y) => (y.score ?? 0) - (x.score ?? 0)));
  const rest = ps.filter((p) => !STAGES.includes(p.stage));
  const out = [];
  while (by.some((l) => l.length)) for (const l of by) if (l.length) out.push(l.shift());
  return [...out, ...rest];
};
let placed = 0;
for (const kind of ["reel", "carousel", "post"]) {
  for (const p of queue(kind)) {
    const t = nextSlot(kind);
    if (t === null) { console.log(`no open slot for ${p.id} in the next 400 days`); continue; }
    p.scheduled_at = new Date(t).toISOString();
    hold(kind, t);
    placed++;
  }
}
writeJSON(file, data);

// ---- the words for each network --------------------------------------------------------------------------------------
const paras = (t) => String(t ?? "").trim().split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
function ensureSave(text) {
  const ps = paras(text);
  if (!ps.length || ps.slice(0, -1).some((x) => /\bsave\b/i.test(x)) || (ps.length === 1 && /\bsave\b/i.test(ps[0]))) return text.trim();
  return (ps.length === 1 ? [ps[0], "Save this post for later."] : [...ps.slice(0, -1), "Save this post for later.", ps[ps.length - 1]]).join("\n\n");
}
// keep the hook, the save line, the next step (the last paragraph), and as many of the paragraphs after the hook as fit
// in an unbroken run, never ending on a lead-in line ("Three steps:") whose list was cut
function fit(text, max) {
  const t = text.trim();
  if (t.length <= max) return t;
  const ps = paras(t), hook = ps[0], last = ps.length > 1 ? ps[ps.length - 1] : "";
  const saveIdx = ps.slice(1, -1).findIndex((x) => /\bsave\b/i.test(x));
  const save = saveIdx >= 0 ? ps[saveIdx + 1] : "";
  const mid = ps.slice(1, -1).filter((x) => x !== save);
  const join = (xs) => xs.filter(Boolean).join("\n\n");
  if (join([hook, save, last]).length <= max) {
    const kept = [];
    for (const p of mid) { if (join([hook, ...kept, p, save, last]).length > max) break; kept.push(p); }
    while (kept.length && /:\s*$/.test(kept[kept.length - 1])) kept.pop();
    return join([hook, ...kept, save, last]);
  }
  if (join([hook, last]).length <= max) return join([hook, last]);
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}\u2026`;
}
function wordsOf(p) {
  const t = readText(path.join(ep, p.dir, p.kind === "post" ? "post.md" : "caption.md"));
  const [body, ...rest] = t.split(/\n-{3,}\s*\n/);
  const meta = rest.join("\n");
  const first = (meta.match(/^first comment:\s*(.+)$/im) ?? [])[1] ?? "";
  const endings = Object.fromEntries([...meta.matchAll(/^on ([a-z ]+):\s*(.+)$/gim)].map((m) => [m[1].trim().toLowerCase(), m[2].trim()]));
  return { body: body.replace(/^# .*\n+/, "").trim(), first, endings };
}
const netKey = (n) => String(n).toLowerCase().replace(/\s+shorts?$/, "").replace(/^twitter$/, "x");
function textFor(p, w, net) {
  let t = w.body;
  const end = w.endings[netKey(net)] ?? w.endings[String(net).toLowerCase()];
  if (end) t = [...paras(t).slice(0, -1), end].join("\n\n");
  return fit(ensureSave(t), LIMIT[netKey(net)] ?? 2200);
}
function mediaOf(p) {
  const d = path.join(ep, p.dir);
  const rel = (f) => path.relative(ep, path.join(d, f)).split(path.sep).join("/");
  if (p.kind === "reel") return exists(path.join(d, "reel.mp4")) ? [rel("reel.mp4")] : [];
  if (p.kind === "post") return exists(path.join(d, "card.png")) ? [rel("card.png")] : [];
  const png = path.join(d, "png");
  return exists(png) ? fs.readdirSync(png).filter((f) => /\.png$/i.test(f) && !/contact-sheet/.test(f)).sort().slice(0, 10).map((f) => rel(path.join("png", f))) : [];
}

// ---- write the CSVs --------------------------------------------------------------------------------------------------
const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const rowsOut = [];
const sched = data.pieces.filter((p) => statuses.includes(p.status) && p.scheduled_at).sort((x, y) => Date.parse(x.scheduled_at) - Date.parse(y.scheduled_at));
for (const p of sched) {
  const t = Date.parse(p.scheduled_at), w = wordsOf(p), media = mediaOf(p);
  const nets = b.settings.networks?.[p.kind] ?? [];
  for (const net of nets.length ? nets : ["any"]) rowsOut.push({ date: dayOf(t), time: hhmm(t), timezone: TZ, datetime_utc: p.scheduled_at, piece: p.id, kind: p.kind, stage: p.stage ?? "", network: net, title: p.title, text: textFor(p, w, net), first_comment: w.first, media: media.join("; "), cover: p.kind === "reel" && exists(path.join(ep, p.dir, "cover.png")) ? path.relative(ep, path.join(ep, p.dir, "cover.png")).split(path.sep).join("/") : "", status: p.status, episode: data.episode.title });
}
const cols = ["date", "time", "timezone", "datetime_utc", "piece", "kind", "stage", "network", "title", "text", "first_comment", "media", "cover", "status", "episode"];
fs.writeFileSync(path.join(ep, "calendar.csv"), [cols.join(","), ...rowsOut.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n") + "\n");

// the scheduler's own template, filled in by matching its column names
const tplName = b.settings.scheduler?.template;
const tpl = tplName && studio ? [path.join(studio, "brand", tplName), path.join(studio, tplName), tplName].find((f) => exists(f)) : null;
if (tpl) {
  const header = readText(tpl).split(/\r?\n/)[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const NETS = /^(facebook|instagram|linkedin|threads|tiktok|youtube|x|twitter|pinterest|bluesky|gbp|google)/i;
  const netCols = header.filter((h) => NETS.test(h));
  const perPiece = netCols.length > 0;
  const mediaCols = header.filter((h) => /(image|picture|media|video|photo|file)/i.test(h) && !/(alt|thumbnail|cover|title)/i.test(h));
  const lines = [];
  const groups = perPiece ? [...new Map(rowsOut.map((r) => [r.piece, rowsOut.filter((x) => x.piece === r.piece)])).values()] : rowsOut.map((r) => [r]);
  for (const g of groups) {
    const r = g[0], media = r.media ? r.media.split("; ") : [];
    const main = g.find((x) => netKey(x.network) === netKey(b.settings.main_network)) ?? r;
    let mi = 0;
    lines.push(header.map((h) => {
      if (/^(text|message|caption|content|post( text)?|body|description)$/i.test(h)) return q(main.text);
      if (/^date$/i.test(h)) return q(r.date);
      if (/^(time|hour)$/i.test(h)) return q(r.time);
      if (/(date.?(and|&)?.?time|schedule|publish|posting time|datetime)/i.test(h)) return q(`${r.date} ${r.time}`);
      if (/time.?zone/i.test(h)) return q(r.timezone);
      if (/first.?comment/i.test(h)) return q(r.first_comment);
      if (/^title$/i.test(h)) return q(r.title);
      if (/^(network|platform|channel|social|account)s?$/i.test(h)) return q(r.network);
      if (perPiece && NETS.test(h)) return q(g.some((x) => netKey(x.network) === netKey(h.split(/[\s_]/)[0])) ? "TRUE" : "FALSE");
      if (mediaCols.includes(h)) return q(media[mi++] ?? "");
      return q("");
    }).join(","));
  }
  const out = path.join(ep, `calendar-${String(b.settings.scheduler?.name ?? "scheduler").toLowerCase()}.csv`);
  fs.writeFileSync(out, [header.map(q).join(","), ...lines].join("\n") + "\n");
  console.log(`scheduler file: ${out} (its media columns hold file paths; most schedulers need the files attached or uploaded, since a CSV can only carry links)`);
}

// ---- folders, one per slot -------------------------------------------------------------------------------------------
if (o.folders) {
  for (const p of sched) {
    const t = Date.parse(p.scheduled_at);
    const dir = path.join(ep, "to-post", `${dayOf(t)}_${hhmm(t).replace(":", "")}_${p.id}-${p.kind}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const m of mediaOf(p)) fs.copyFileSync(path.join(ep, m), path.join(dir, path.basename(m)));
    const w = wordsOf(p);
    for (const net of b.settings.networks?.[p.kind] ?? ["any"]) fs.writeFileSync(path.join(dir, `text-${netKey(net)}.txt`), textFor(p, w, net) + "\n");
    if (w.first) fs.writeFileSync(path.join(dir, "first-comment.txt"), w.first + "\n");
  }
  console.log(`folders: ${path.join(ep, "to-post")}`);
}

console.log(`calendar: ${path.join(ep, "calendar.csv")} (${sched.length} piece${sched.length === 1 ? "" : "s"}, ${rowsOut.length} row${rowsOut.length === 1 ? "" : "s"}, ${TZ} time${placed ? `, ${placed} newly placed` : ""})`);
for (const p of sched) { const t = Date.parse(p.scheduled_at); console.log(`  ${dayOf(t)} ${WD[new Date(dayOf(t) + "T12:00:00Z").getUTCDay()]} ${hhmm(t)}  ${p.id} ${p.kind.padEnd(8)} ${p.title}`); }
const waiting = data.pieces.filter((p) => !statuses.includes(p.status) && !["posted", "dropped"].includes(p.status));
if (waiting.length) console.log(`not on the calendar yet (${waiting.length}): ${waiting.map((p) => `${p.id} ${p.status}`).join(", ")}`);
