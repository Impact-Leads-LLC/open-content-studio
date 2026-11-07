#!/usr/bin/env node
// The episode's state: pieces.json holds every piece's plan, status and dates; each piece's words and files live in its
// own folder (pieces/<id>-<slug>/). Use this script for every change to pieces.json so the file stays valid.
//
//   node pieces.mjs init <episode-dir> --title "..." --source episode|clip|transcript|library [--video a.mp4,b.mp4]
//                        [--guest "Name"] [--show "Show"] [--link https://...] [--minutes 52]
//   node pieces.mjs list <episode-dir> [--kind reel|carousel|post] [--status draft|ready|approved|scheduled|posted|dropped]
//   node pieces.mjs add <episode-dir> --kind post --title "..." [--stage problem] [--hook "..."]
//   node pieces.mjs set <episode-dir> <id> key=value [key=value ...]
//   node pieces.mjs approve|ready|draft|drop|scheduled <episode-dir> <id ...|all-ready>
//   node pieces.mjs posted <episode-dir> <id ...> [--at 2026-11-07T09:00]
//   node pieces.mjs review <episode-dir> <id> <review.json>     (stores the coach's review, sets ready or draft)
//   node pieces.mjs where <episode-dir> <id>
//   node pieces.mjs recent <studio-dir> [--days 60]              (pieces made lately, so a run doesn't repeat them)
import fs from "node:fs";
import path from "node:path";
import { args, die, readJSON, writeJSON, exists, slug, loadPieces, cleanStage, FUNNEL_OF, STAGE_LABEL, findStudio, nextId, PREFIX } from "./lib.mjs";

const o = args();
const [cmd, target, ...rest] = o._;
const STATUSES = ["draft", "ready", "approved", "scheduled", "posted", "dropped"];
const now = () => new Date().toISOString();
const ep = target ? path.resolve(target) : null;

function save(file, data) { writeJSON(file, data); }
function find(data, id) {
  const p = data.pieces.find((x) => x.id === id);
  if (!p) die(`No piece ${id} in this episode. Pieces: ${data.pieces.map((x) => x.id).join(", ") || "none"}`);
  return p;
}
const coerce = (v) => (v === "null" ? null : v === "true" ? true : v === "false" ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : /^[[{]/.test(v) ? JSON.parse(v) : v);

switch (cmd) {
  case "init": {
    if (!ep) die("Usage: node pieces.mjs init <episode-dir> --title \"...\" --source episode|clip|transcript|library");
    const file = path.join(ep, "pieces.json");
    if (exists(file) && !o.force) die(`${file} already exists (add --force to start it over).`);
    const source = ["episode", "clip", "transcript", "library"].includes(o.source) ? o.source : die("--source must be episode, clip, transcript or library.");
    fs.mkdirSync(path.join(ep, "pieces"), { recursive: true });
    fs.mkdirSync(path.join(ep, "moments"), { recursive: true });
    const video = o.video ? String(o.video).split(",").map((v) => path.resolve(v.trim())).filter(Boolean) : [];
    save(file, {
      version: 1,
      episode: { title: o.title ?? path.basename(ep), slug: path.basename(ep), date: (o.date ?? now()).slice(0, 10), source, video, guest: o.guest ?? null, show: o.show ?? null, link: o.link ?? null, minutes: o.minutes ? Number(o.minutes) : null, created: now() },
      pieces: [],
    });
    console.log(`started ${file}`);
    break;
  }
  case "list": {
    const { data } = loadPieces(ep);
    const rows = data.pieces.filter((p) => (!o.kind || p.kind === o.kind) && (!o.status || p.status === o.status));
    console.log(`${data.episode.title} (${data.episode.source}): ${data.pieces.length} pieces`);
    for (const p of rows) console.log(`${p.id.padEnd(4)} ${p.kind.padEnd(8)} ${String(p.status).padEnd(9)} ${(STAGE_LABEL[p.stage] ?? "-").padEnd(14)} ${p.score != null ? String(p.score).padStart(3) : "  -"}  ${p.title}${p.scheduled_at ? `  [${p.scheduled_at}]` : ""}`);
    const by = (k) => data.pieces.filter((p) => p.status === k).length;
    console.log(STATUSES.map((s) => `${s} ${by(s)}`).join(", "));
    break;
  }
  case "add": {
    const { file, data } = loadPieces(ep);
    const kind = PREFIX[o.kind] ? o.kind : die("--kind must be reel, carousel or post.");
    const id = nextId(data.pieces, kind);
    const stage = cleanStage(o.stage);
    const dir = `pieces/${id}-${slug(o.title ?? kind)}`;
    fs.mkdirSync(path.join(ep, dir), { recursive: true });
    data.pieces.push({ id, kind, status: "draft", title: o.title ?? "", stage, funnel: stage ? FUNNEL_OF[stage] : null, hook: o.hook ?? "", dir, added: "by hand", history: [{ at: now(), note: "added by hand" }] });
    save(file, data);
    console.log(`${id} added: ${dir}`);
    break;
  }
  case "set": {
    const { file, data } = loadPieces(ep);
    const p = find(data, rest[0]);
    for (const kv of rest.slice(1)) {
      const i = kv.indexOf("=");
      if (i < 1) die(`"${kv}" isn't key=value.`);
      const k = kv.slice(0, i), v = coerce(kv.slice(i + 1));
      if (k === "status" && !STATUSES.includes(v)) die(`status must be one of ${STATUSES.join(", ")}`);
      if (k === "stage") { p.stage = cleanStage(v); p.funnel = p.stage ? FUNNEL_OF[p.stage] : null; continue; }
      if (k === "id" || k === "kind") die(`${k} can't be changed.`);
      p[k] = v;
    }
    (p.history ??= []).push({ at: now(), note: `set ${rest.slice(1).join(" ")}` });
    save(file, data);
    console.log(`${p.id} updated`);
    break;
  }
  case "approve": case "ready": case "draft": case "drop": case "scheduled": case "posted": {
    const { file, data } = loadPieces(ep);
    const status = { approve: "approved", drop: "dropped" }[cmd] ?? cmd;
    const ids = rest.includes("all-ready") ? data.pieces.filter((p) => p.status === "ready").map((p) => p.id) : rest;
    if (!ids.length) die(`Name the pieces: node pieces.mjs ${cmd} <episode-dir> r01 c02 ...`);
    const at = o.at ? new Date(o.at).toISOString() : now();
    for (const id of ids) {
      const p = find(data, id);
      p.status = status;
      if (status === "posted") p.posted_at = at;
      if (status === "approved") p.approved_at = now();
      (p.history ??= []).push({ at: now(), note: status });
    }
    save(file, data);
    console.log(`${ids.join(", ")}: ${status}${status === "posted" ? ` (${at})` : ""}`);
    break;
  }
  case "review": {
    const { file, data } = loadPieces(ep);
    const p = find(data, rest[0]);
    const src = rest[1] ? path.resolve(rest[1]) : die("Usage: node pieces.mjs review <episode-dir> <id> <review.json>");
    const r = readJSON(src);
    if (!["ready", "fix", "rethink"].includes(r.verdict)) die("review.json needs verdict: ready, fix or rethink.");
    const dest = path.join(ep, p.dir, "review.json");
    if (path.resolve(src) !== dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
    p.verdict_coach = r.verdict;
    p.coach_score = r.score ?? null;
    if (["draft", "ready"].includes(p.status)) p.status = r.verdict === "ready" ? "ready" : "draft";
    (p.history ??= []).push({ at: now(), note: `coach: ${r.verdict}${r.score != null ? ` ${r.score}` : ""}` });
    save(file, data);
    console.log(`${p.id}: ${r.verdict}${r.score != null ? ` (${r.score})` : ""}, status ${p.status}`);
    break;
  }
  case "where": {
    const { data } = loadPieces(ep);
    console.log(path.join(ep, find(data, rest[0]).dir));
    break;
  }
  case "recent": {
    const studio = findStudio(target ?? process.cwd(), target);
    if (!studio) die("No studio folder found.");
    const days = Number(o.days ?? 60), since = Date.now() - days * 864e5;
    const eps = path.join(studio, "episodes");
    const out = [];
    for (const d of exists(eps) ? fs.readdirSync(eps) : []) {
      const f = path.join(eps, d, "pieces.json");
      if (!exists(f)) continue;
      const j = readJSON(f, null);
      if (!j || Date.parse(j.episode?.created ?? j.episode?.date ?? 0) < since) continue;
      for (const p of j.pieces ?? []) out.push(`${d}/${p.id} ${p.kind}, ${STAGE_LABEL[p.stage] ?? "no stage"}${p.status === "dropped" ? " (dropped)" : ""}: ${p.title}${p.insight ? ` [insight: ${p.insight}]` : ""}`);
    }
    console.log(out.length ? out.join("\n") : `Nothing made in the last ${days} days.`);
    break;
  }
  default:
    die("Commands: init, list, add, set, approve, ready, draft, drop, scheduled, posted, review, where, recent. See the top of pieces.mjs.");
}
