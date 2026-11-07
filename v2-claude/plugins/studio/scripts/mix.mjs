#!/usr/bin/env node
// The per-episode mix, applied the same way every time: reads the scouts' candidates and the coach's verdicts, scores
// them, fills the board level by level, holds reels to the bar, never cuts two reels from the same stretch, and adds the
// picks to pieces.json. It also writes moments/report.json: what was found, what was kept, which levels came up short,
// and what was turned down and why.
//
//   node mix.mjs <episode-dir> [--mix full|light] [--dry-run]
//
// <episode-dir>/moments/candidates.json  { "candidates": [ { "id": 0, "kind": "reel|carousel|post", "title", "start",
//     "end", "speaker", "quote", "scores": { "hook", "smart", "ip", "icp", "standalone" }, "why", "ip_name",
//     "icp_pain", "service", "insight", "awareness", "library": ["file.md"] } ] }
// <episode-dir>/moments/verdicts.json    { "verdicts": [ { "id": 0, "keep": true, "reject": "", "kind", "title", "start",
//     "end", "scores": {...}, "hook", "cover_line", "cover_accent", "angle", "needs_take", "cta", "design": [], "outline",
//     "verdict", "insight", "awareness" } ] }
// Scores are 0 to 10 each. Points out of 100: hook x2.5, smart x2.5, ip x2, icp x2, standalone x1.
import fs from "node:fs";
import path from "node:path";
import { args, die, readJSON, writeJSON, loadPieces, findStudio, brand, secs, clock, slug, cleanStage, FUNNEL_OF, STAGES, STAGE_LABEL, nextId } from "./lib.mjs";

const o = args();
const ep = o._[0] ? path.resolve(o._[0]) : die("Usage: node mix.mjs <episode-dir> [--mix full|light] [--dry-run]");
const { file, data } = loadPieces(ep);
const studio = findStudio(ep, o.studio);
const b = brand(studio);
const cands = readJSON(path.join(ep, "moments", "candidates.json")).candidates ?? die("moments/candidates.json has no candidates list.");
const verdicts = readJSON(path.join(ep, "moments", "verdicts.json")).verdicts ?? die("moments/verdicts.json has no verdicts list.");
const byId = new Map(cands.map((c, i) => [c.id ?? i, c]));

const WEIGHTS = { hook: 2.5, smart: 2.5, ip: 2, icp: 2, standalone: 1 };
const total = (s = {}) => Math.round(Object.keys(WEIGHTS).reduce((a, k) => a + Math.max(0, Math.min(10, Number(s[k]) || 0)) * WEIGHTS[k], 0));
const FLOOR = 55, BACKUP = 45;
const source = data.episode.source;
const long = (data.episode.minutes ?? 0) >= 20;
const FULL = {
  episode: { reel: { min: 5, max: 8 }, per: { carousel: 2, post: 2 } },
  clip: { reel: { min: 1, max: 3 }, per: { carousel: 1, post: 1 } },
  transcript: { reel: { min: 0, max: 0 }, per: long ? { carousel: 2, post: 2 } : { carousel: 1, post: 1 } },
  library: { reel: { min: 0, max: 0 }, per: { carousel: 1, post: 1 } },
};
const LIGHT = {
  episode: { reel: { min: 3, max: 5 }, per: { carousel: 1, post: 1 } },
  clip: { reel: { min: 1, max: 2 }, per: { carousel: 1, post: 1 } },
  transcript: { reel: { min: 0, max: 0 }, per: { carousel: 1, post: 1 } },
  library: { reel: { min: 0, max: 0 }, per: { carousel: 1, post: 1 } },
};
const mixName = (o.mix ?? b.settings.mix) === "light" ? "light" : "full";
const mix = (mixName === "light" ? LIGHT : FULL)[source] ?? FULL.episode;
const KINDS = ["reel", "carousel", "post"];
const keywords = (b.settings.lead_magnets ?? []).map((l) => String(l.keyword ?? "").toUpperCase()).filter(Boolean);
const hasEpisode = !!(data.episode.link || data.episode.show) && ["episode", "clip"].includes(source);

const live = data.pieces.filter((p) => p.status !== "dropped");
const have = (kind, st) => live.filter((p) => p.kind === kind && (st === undefined || p.stage === st)).length;
const overlap = (x, y) => Math.max(0, Math.min(x[1], y[1]) - Math.max(x[0], y[0])) / Math.max(1, Math.min(x[1] - x[0], y[1] - y[0]));
const taken = live.filter((p) => p.kind === "reel" && Number.isFinite(secs(p.start))).map((p) => [secs(p.start), Number.isFinite(secs(p.end)) ? secs(p.end) : secs(p.start) + 45]);

const scored = verdicts.map((v) => {
  const c = byId.get(v.id);
  if (!c) return null;
  // the coach may move a carousel to a post or back; a reel stays a reel and a text piece never becomes one
  const kind = KINDS.includes(v.kind) && (v.kind === "reel") === (c.kind === "reel") ? v.kind : c.kind;
  if (!KINDS.includes(kind) || (kind === "reel" && mix.reel.max === 0)) return null;
  const a = Number.isFinite(secs(v.start)) ? secs(v.start) : secs(c.start);
  const e = secs(v.end || c.end);
  const end = kind === "reel" && Number.isFinite(e) && e - a >= 10 && e - a <= 120 ? e : null;
  const score = total(v.scores ?? c.scores);
  const stage = cleanStage(v.awareness) ?? cleanStage(c.awareness);
  const cta0 = String(v.cta ?? "").trim().toUpperCase();
  const cta = keywords.includes(cta0) ? cta0 : stage === "product" || stage === "most" || !hasEpisode ? "CALL" : "EPISODE";
  const reel = kind === "reel";
  const keep = !!v.keep && (!reel || score >= BACKUP);
  const reject = v.keep ? (reel && score < BACKUP ? `Scored ${score}, under ${BACKUP}.` : "") : String(v.reject ?? "");
  return {
    keep, reject, score, span: [Number.isFinite(a) ? a : 0, end ?? (Number.isFinite(a) ? a + 45 : 45)],
    pick: {
      kind, title: String(v.title || c.title || "").trim(), stage, funnel: stage ? FUNNEL_OF[stage] : null,
      insight: String(v.insight || c.insight || "").trim().replace(/^["'\s]+|["'.\s]+$/g, "").slice(0, 80) || null,
      hook: String(v.hook ?? "").trim(), cover_line: v.cover_line ?? null, cover_accent: v.cover_accent ?? null,
      angle: String(v.angle ?? "").trim(), needs_take: !!v.needs_take, verdict: String(v.verdict ?? "").trim() || c.why || "",
      score, scores: v.scores ?? c.scores, scout_score: total(c.scores),
      start: Number.isFinite(a) ? clock(a) : null, end: end === null ? null : clock(end),
      speaker: c.speaker ?? "", quote: c.quote ?? "", ip_name: c.ip_name ?? "", icp_pain: c.icp_pain ?? "", service: c.service ?? "",
      cta, library: kind === "reel" ? [] : (c.library ?? []).map(String).filter(Boolean).slice(0, 3),
      outline: kind === "carousel" ? String(v.outline ?? "").trim() || null : null,
      design: kind === "post" ? [] : (v.design ?? []).map(String).filter(Boolean),
    },
  };
}).filter(Boolean).sort((x, y) => y.score - x.score);

const picks = [], used = new Set(), gaps = [];
const overlaps = (x) => x.pick.kind === "reel" && taken.some((t) => overlap(t, x.span) > 0.5);
const take = (x) => {
  if (x.pick.kind === "reel" && x.score < FLOOR) x.pick.below_bar = true;
  picks.push(x.pick);
  used.add(x);
  if (x.pick.kind === "reel") taken.push(x.span);
};
const open = (kind, floor, st) => scored.filter((x) => x.keep && x.score >= floor && !used.has(x) && x.pick.kind === kind && (st === undefined || x.pick.stage === st) && !overlaps(x));
const count = (kind) => have(kind) + picks.filter((p) => p.kind === kind).length;

// carousels and posts: level by level, then any level the material couldn't fill goes to the next best from the others
for (const kind of ["carousel", "post"]) {
  const per = mix.per[kind];
  for (const st of STAGES) {
    let want = Math.max(0, per - have(kind, st));
    const got = open(kind, 0, st).slice(0, want);
    got.forEach(take);
    want -= got.length;
    if (want > 0) gaps.push({ kind, stage: st, want: per, got: per - want });
  }
  for (const x of open(kind, 0)) { if (count(kind) >= per * STAGES.length) break; take(x); }
}
// reels: one per level first at the bar, then the best of the rest up to the max, then down to the backup bar only to
// reach the minimum; each reel claims its stretch so the next can't overlap it
for (const st of STAGES) {
  if (count("reel") >= mix.reel.max) break;
  const x = open("reel", FLOOR, st)[0];
  if (x) take(x);
}
for (const [floor, cap] of [[FLOOR, mix.reel.max], [BACKUP, mix.reel.min]]) {
  for (let x = open("reel", floor)[0]; x && count("reel") < cap; x = open("reel", floor)[0]) take(x);
}
if (mix.reel.min > 0 && count("reel") < mix.reel.min) gaps.push({ kind: "reel", stage: "any", want: mix.reel.min, got: count("reel") });

const rejected = scored.filter((x) => !used.has(x)).map((x) => ({
  title: x.pick.title, kind: x.pick.kind, stage: x.pick.stage, score: x.score,
  reason: !x.keep ? x.reject || "Turned down." : overlaps(x) ? "Overlaps a reel already picked." : `The ${x.pick.kind}s${x.pick.stage && x.pick.kind !== "reel" ? ` for ${STAGE_LABEL[x.pick.stage].toLowerCase()} readers` : ""} were already full with stronger ones.`,
}));

// add the picks: reels first by score, then carousels and posts in level order
const order = (p) => (p.kind === "reel" ? 0 : p.kind === "carousel" ? 1 : 2) * 10 + (STAGES.indexOf(p.stage) + 1);
picks.sort((x, y) => order(x) - order(y) || y.score - x.score);
const added = [];
for (const p of picks) {
  const id = nextId(data.pieces, p.kind);
  const dir = `pieces/${id}-${slug(p.title)}`;
  const piece = { id, ...p, status: "draft", dir, made: new Date().toISOString(), history: [{ at: new Date().toISOString(), note: `picked (score ${p.score}${p.below_bar ? ", under the usual bar" : ""})` }] };
  data.pieces.push(piece);
  added.push(piece);
  if (!o["dry-run"]) fs.mkdirSync(path.join(ep, dir), { recursive: true });
}
const byKind = (arr) => Object.fromEntries(KINDS.map((k) => [k, arr.filter((x) => (x.kind ?? x.pick?.kind) === k).length]));
const report = {
  at: new Date().toISOString(), mix: mixName, source, floor: FLOOR, backup: BACKUP,
  candidates: byKind(cands), kept: byKind(scored.filter((x) => x.keep).map((x) => x.pick)), added: byKind(added),
  below_bar: added.filter((p) => p.below_bar).map((p) => p.id), gaps, rejected: rejected.sort((x, y) => y.score - x.score).slice(0, 80),
};
if (!o["dry-run"]) {
  writeJSON(file, data);
  writeJSON(path.join(ep, "moments", "report.json"), report);
}
console.log(`${o["dry-run"] ? "(dry run) " : ""}mix: ${mixName} for a ${source}`);
console.log(`found ${cands.length} candidates; the coach kept ${scored.filter((x) => x.keep).length}`);
console.log(`added: ${added.filter((p) => p.kind === "reel").length} reels, ${added.filter((p) => p.kind === "carousel").length} carousels, ${added.filter((p) => p.kind === "post").length} posts`);
for (const p of added) console.log(`  ${p.id} ${p.kind.padEnd(8)} ${(STAGE_LABEL[p.stage] ?? "no stage").padEnd(14)} ${String(p.score).padStart(3)}${p.below_bar ? " (under the usual bar)" : ""}  ${p.title}`);
if (gaps.length) console.log(`short: ${gaps.map((g) => `${g.kind} ${g.stage === "any" ? "" : `${STAGE_LABEL[g.stage] ?? g.stage} `}${g.got}/${g.want}`).join(", ")}`);
if (rejected.length) console.log(`turned down: ${rejected.length} (reasons in moments/report.json)`);
