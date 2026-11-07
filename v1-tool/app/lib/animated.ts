import { db, storage } from "./supabase";
import { coverPath, planPath, renderPath, sheetPath, startJob } from "./render";
import { engineEnv } from "./brain";
import { studioContext } from "./brand";
import { transcriptFor } from "./coach";
import { parseTranscript } from "./transcript";
import { secs } from "./time";
import { stageNote } from "./stages";
import type { Piece } from "./pieces";

// The animated reel editor: a reel with no camera footage (every reel from a standalone idea, or any reel marked
// media.animated) is made from its words on a cloud machine: the cover for half a second, then animated type and brand
// graphics on the board, at reading pace with sound effects, then the end card. Ideas keep their text only
// (app/api/ideas stores the transcript, no audio), so the reel has no voice unless the owner records a voiceover.
// The engine ships as uploads/<ts>-animated-engine.tgz in studio-media (engines/animated-engine, packed by
// engines/pack.sh); the newest upload wins, so a new version goes live by uploading it. The job leaves the same files a
// footage reel does (renderPath, coverPath, sheetPath, planPath), so lib/pieces.ts refresh() records it, and the coach
// reviews it, the same way.

// Runs on the cloud machine: unpack the editor and hand over to its run.sh.
const ANIMATE = `#!/bin/bash
S=/tmp/job/status.txt
cd /tmp/job && curl -sSfL "$ENGINE_URL" -o engine.tgz && tar xzf engine.tgz || {
  echo "FAILED at download (animated reel editor)" > "$S"; curl -sS -X PUT -H "content-type: text/plain" -H "x-upsert: true" --data-binary @"$S" "$OUT_LOG" > /dev/null; exit 1; }
exec bash /tmp/job/animated-engine/run.sh
`;

export const isAnimJob = (id?: string) => !!id?.startsWith("animated-");

// What the editor reads (animated-engine/plan.mjs): the piece's plan from the Moment Coach, the words it comes from
// (script: the source lines around it, `in` marking its own stretch), its stage, the team's notes, the owner's rules, and
// for a change the beats the team liked plus what to change.
export type AnimatedContext = {
  piece: { num: number; title: string; hook: string | null; why: string | null; outline: string | null; insight: string | null; awareness: string | null; funnel: string | null; caption: string | null; angle: string | null; cta: string | null; service: string | null };
  episode: { title: string; show: string; kind: string | null };
  script: { at: number; who: string; text: string; in: boolean }[];
  stage?: string;
  notes?: string;
  rules?: string[];
  previous?: { beats: unknown[]; end?: unknown };
  change?: string;
  // the owner's voiceover (lib/voiceover.ts): the script they read; the take itself comes as VO_URL
  vo?: { lines: string[]; seconds?: number };
};

// The newest upload of the animated editor, or null.
export async function animatedEngine() {
  const { data } = await storage().list("uploads", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  const f = (data ?? []).find((x) => /animated-engine.*\.tgz$/.test(x.name));
  return f ? `uploads/${f.name}` : null;
}

// The words the reel is made from: the piece's stretch of the idea (or episode) with 30 seconds before and 20 after as
// context. An idea's times are estimates from word counts, so a short idea goes whole, and a stretch that matches
// nothing falls back to the start of the text.
export async function animatedScript(p: Pick<Piece, "episode_id" | "source_time" | "source_end">, idea: boolean) {
  const { lines } = parseTranscript(await transcriptFor(p.episode_id));
  if (!lines.length) return [];
  let a = secs(p.source_time), b = secs(p.source_end);
  if (!Number.isFinite(a)) a = lines[0].t;
  if (!Number.isFinite(b) || b <= a) b = a + 75;
  const chars = lines.reduce((n, l) => n + l.text.length, 0);
  const whole = idea && chars <= 4000;
  const next = (i: number) => lines[i + 1]?.t ?? lines[i].t + 6;
  const hit = lines.some((l, i) => next(i) > a && l.t < b);
  const out: AnimatedContext["script"] = [];
  let used = 0;
  lines.forEach((l, i) => {
    const inside = next(i) > a && l.t < b;
    if ((!whole && (next(i) < a - 30 || l.t > b + 20)) || used > 12000) return;
    used += l.text.length;
    out.push({ at: Math.round(l.t * 10) / 10, who: l.who, text: l.text, in: inside || (whole && !hit) });
  });
  if (!out.some((l) => l.in)) out.slice(0, 8).forEach((l) => { l.in = true; });
  return out;
}

// Start the editor; returns the job id the piece's media.render tracks (lib/pieces.ts refresh()).
export async function startAnimated(p: Piece, ep: { title: string; show: string; kind?: string | null }, opts: { notes?: string; change?: string; previous?: AnimatedContext["previous"]; rules?: string[] } = {}) {
  const engine = await animatedEngine();
  if (!engine) throw new RangeError("The animated reel editor file isn't uploaded.");
  const m = (p.moment ?? {}) as { angle?: string; cta?: string; service?: string };
  const context: AnimatedContext = {
    piece: {
      num: p.num, title: p.title, hook: p.hook, why: p.why, outline: p.outline ?? null, insight: p.insight ?? null, awareness: p.awareness ?? null,
      funnel: p.funnel ?? null, caption: p.caption ?? null, angle: m.angle ?? null, cta: m.cta ?? null, service: m.service ?? null,
    },
    episode: { title: ep.title, show: ep.show, kind: ep.kind ?? null },
    script: await animatedScript(p, ep.kind === "idea"),
    stage: stageNote(p) || undefined,
    notes: opts.notes || undefined,
    rules: opts.rules?.length ? opts.rules : undefined,
    previous: opts.change ? opts.previous : undefined,
    change: opts.change || undefined,
  };
  // With a take, the reel follows the owner's voice; without one it's set at reading pace as before
  const vo = ((p.media ?? {}) as { vo?: { audio?: string; seconds?: number; script?: { lines?: string[] } } }).vo;
  if (vo?.audio) context.vo = { lines: vo.script?.lines ?? [], seconds: vo.seconds };
  if (!context.script.length && !p.hook) throw new RangeError("There are no words to make this reel from. Add the idea's text first.");
  const id = `animated-${Date.now()}`;
  const sb = storage();
  const [e, mp4, log, sheet, plan, cover, voice] = await Promise.all([
    sb.createSignedUrl(engine, 7200),
    sb.createSignedUploadUrl(renderPath(id)),
    sb.createSignedUploadUrl(`renders/${id}-timings.txt`),
    sb.createSignedUploadUrl(sheetPath(id)),
    sb.createSignedUploadUrl(planPath(id)),
    sb.createSignedUploadUrl(coverPath(id)),
    vo?.audio ? sb.createSignedUrl(vo.audio, 7200) : Promise.resolve({ data: null, error: null }),
  ]);
  const err = e.error || mp4.error || log.error || sheet.error || plan.error || cover.error || voice.error;
  if (err) throw err;
  // the Claude key and the brain connector token go to the machine for the plan only; run.sh never prints them
  await startJob(id, ANIMATE, {
    ENGINE_URL: e.data!.signedUrl, OUT_MP4: mp4.data!.signedUrl, OUT_LOG: log.data!.signedUrl, OUT_SHEET: sheet.data!.signedUrl,
    OUT_PLAN: plan.data!.signedUrl, OUT_COVER: cover.data!.signedUrl, VO_URL: voice.data?.signedUrl ?? "",
    ...engineEnv(),
  }, 8, 45, [{ path: "/tmp/job/context.json", content: JSON.stringify({ ...context, studio: studioContext() }) }]);
  return id;
}

// The beats of the last animated edit, for a change that keeps the reel and changes only what's asked.
export async function previousBeats(plan?: string) {
  if (!plan || plan.endsWith("deck.json")) return null;
  const f = await storage().download(plan);
  if (!f.data) return null;
  const pl = JSON.parse(await f.data.text()) as { beats?: Record<string, unknown>[]; end?: unknown };
  if (!Array.isArray(pl.beats) || !pl.beats.length) return null;
  // the builder's own fields (times) are worked out again on every build
  const beats = pl.beats.map(({ t0, t1, ...b }) => b); // eslint-disable-line @typescript-eslint/no-unused-vars
  return { beats, end: pl.end };
}

// The owner's own review rules, for the plan.
export async function activeRules() {
  const { data } = await db().from("studio_rules").select("body").eq("status", "active").order("created_at");
  return (data ?? []).map((r) => r.body as string);
}
