import { db, storage, safeError } from "./supabase";
import { episodeOut, renderStatus, startJob } from "./render";
import { brainCall, engineEnv } from "./brain";
import { OWNER, studioContext } from "./brand";
import { parseTranscript, pickTranscript } from "./transcript";
import { episodeFeeds, people } from "./feeds";

// YouTube thumbnails for every produced full episode, made with the thumbnail builder on a cloud machine (the thumb
// engine, uploads/<ts>-thumb-engine.tgz in studio-media, the newest wins). Three looks in rotation: the call (the
// guest's real webcam frame behind the owner), the number wall (a giant number behind the owner's head, a sticker in the
// accent colour) and the board (a tilted board in the accent colour, the owner in a print). The owner makes two calls
// only: which words, then which thumbnail. Claude finds the episode's biggest takeaway and writes three options, each
// with the words for the looks it suits; option 1 is made on its own once the episode is produced, every look it plays,
// the look published least lately first.
// The photos of the owner come from the brain (their own photos, never regenerated): the brain's thumb_pick picks them
// with its rotation and returns signed links to each photo (and its cutout or mask when there is one), and thumb_use
// logs them. The engine cuts the person out when no cutout comes with the photo (engines/README.md).
// State lives on the episode piece's media.thumb (v: 3); every other media key stays as it is.

export const LOOKS = ["call", "wall", "board"] as const;
export type Look = (typeof LOOKS)[number];
export const LOOK_NAME: Record<Look, string> = { call: "The call", wall: "The number wall", board: "The board" };
export const HOOK_TYPES = ["skeptic", "verdict", "warning", "number", "secret", "smirk", "how"] as const;
export type LookWords = { look: Look; support: string | null; hero: string; sticker: string | null; order: "support-first" | "hero-first"; mark: { kind: "loop"; target: "hero" } | null; hook_type: string };
export type ThumbOption = { n: number; looks: LookWords[]; guest_at: number | null; guest_line?: string; mechanism?: string; why: string; title_fit?: string; source_line?: string; payoff_line?: string; flags?: string[] };
type Job = { status: "running" | "ready" | "failed"; job: string; at: string; log?: string };
// a pair as given to this run: enough to sign it again (a later render in the same run reuses it, see pairFor)
export type PairRef = { id: string; background: string; label: string; cutout: string; side: string; hook_types: string[]; prop: boolean; storage_prefix: string };
type GuestPick = { asked: number; picked: number; exact: boolean; detector?: string; score?: number };
export type LookResult = {
  status: "delivered" | "failed" | "skipped"; look_name?: string; reason?: string; pair?: string; background?: string; background_label?: string;
  cutout?: string; words?: Partial<LookWords>; notes?: string[]; fails?: string[]; checks?: { run: number; failed: string[]; ocr?: string }; rounds?: number; guest?: GuestPick;
};
type Result = { order?: Look[]; looks?: Partial<Record<Look, LookResult>>; notes?: string[]; guest?: GuestPick; failed?: string };
export type ThumbRender = Job & { option: number; order?: Look[]; pairs?: Partial<Record<Look, PairRef>>; skip?: Partial<Record<Look, string>>; result?: Result; logged?: boolean };
export type Thumb = {
  v: 3; rev: number; run_key: string;
  words?: Job & { takeaway?: string; takeaway_line?: string; options?: ThumbOption[]; notes?: string; dropped?: string[]; title?: string };
  renders?: ThumbRender[]; current?: number; auto?: boolean;
  picked?: { option: number; look: Look; pair: string; path: string; at: string; by: string } | null;
};

// What the machine writes, next to its status file (renders/<job>-timings.txt, read by renderStatus).
export const thumbOut = (job: string) => ({
  log: `renders/${job}-timings.txt`, words: `renders/${job}/words.json`, result: `renders/${job}/result.json`, guest: `renders/${job}/guest-candidates.jpg`,
  look: (l: Look) => ({ thumb: `renders/${job}/thumb-${l}.jpg`, review: `renders/${job}/review-${l}.jpg`, feed: `renders/${job}/feed-${l}.jpg`, gate: `renders/${job}/gate-${l}.json` }),
});

// Runs on the cloud machine: unpack the thumbnail builder and hand over to its run.sh (MODE=words or render).
const THUMBS = `#!/bin/bash
S=/tmp/job/status.txt
cd /tmp/job && curl -sSfL "$ENGINE_URL" -o engine.tgz && tar xzf engine.tgz || {
  echo "FAILED at download (thumbnail builder)" > "$S"; curl -sS -X PUT -H "content-type: text/plain" -H "x-upsert: true" --data-binary @"$S" "$OUT_LOG" > /dev/null; exit 1; }
exec bash /tmp/job/thumb-engine/run.sh
`;

export const shown = (w?: Partial<LookWords> | null) => (!w?.hero ? "" : [w.order === "hero-first" ? w.hero : w.support, w.order === "hero-first" ? w.support : w.hero, w.sticker].filter(Boolean).join(" / "));
const now = () => new Date().toISOString();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "episode";
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---- the brain connector (lib/brain.ts): thumb_pick and thumb_use ----
// A pair as thumb_pick returns it: one of the owner's photos, with signed links to the photo and, when the brain has
// them, its cutout (person) and mask. side: where the person sits in the frame.
type PairRow = { pair_id: string; id?: string; background_id: string; background_label?: string; cutout: string; side: string; hook_types?: string[]; frame?: { prop_xy?: unknown } | null; storage_prefix: string; face_box?: unknown; urls?: Record<string, string | null> };
type PickResult = { pairs: PairRow[]; options: { A: string; B: string | null } | null; note?: string };
const connector = brainCall;

// The pairs this episode's run has already been given (the rotation skips them now, because they were just delivered).
const used = (t: Thumb | null) => (t?.renders ?? []).flatMap((r) => Object.values(r.pairs ?? {})).filter((p): p is PairRef => !!p?.storage_prefix);

// The hook types an approved photo of the owner plays right now (the rotation skips a photo used in the last runs), plus the
// ones the pairs this episode already got play. hook-maker writes only to these.
async function playable(t: Thumb | null) {
  const got = await Promise.all(HOOK_TYPES.map((h) => connector<PickResult>("thumb_pick", { hook_type: h, limit: 6 }).then((r) => ({ h, r }), () => ({ h, r: null as PickResult | null }))));
  if (!got.some((g) => g.r)) throw new Error("The brain connector didn't answer thumb_pick.");
  const own = used(t);
  const types = HOOK_TYPES.filter((h) => got.some((g) => g.h === h && g.r?.pairs?.length) || own.some((p) => p.hook_types.includes(h)));
  if (!types.length) throw new RangeError(`No photo of ${OWNER} is free for a thumbnail right now. Add photos to the brain (brain_assets, kind photo) with the hook types they play.`);
  return [...types];
}

// The pairs as the engine reads them (thumb.py fetch): the brain already signed every link. A pair given to this run
// before is asked for again by its id, for fresh links.
export async function signPairs(rows: PairRow[]) {
  return Promise.all(rows.map(async (r) => {
    let urls = r.urls ?? null;
    if (!urls?.photo) {
      const again = await connector<PickResult>("thumb_pick", { hook_type: r.hook_types?.[0] ?? "verdict", ids: [r.pair_id], limit: 1 }).catch(() => null);
      urls = again?.pairs?.find((x) => x.pair_id === r.pair_id)?.urls ?? null;
    }
    if (!urls?.photo) throw new Error(`The brain didn't give a link to the photo for pair ${r.pair_id}.`);
    return { id: r.pair_id, background_id: r.background_id, background_label: r.background_label ?? r.background_id, cutout: r.cutout, side: r.side, hook_types: r.hook_types ?? [], frame: r.frame ?? null, storage_prefix: r.storage_prefix ?? "", ...(r.face_box ? { face_box: r.face_box } : {}), urls };
  }));
}
type SignedPair = Awaited<ReturnType<typeof signPairs>>[number];

// The pair for one look: the rotation's best pair that the look can use (the call puts the guest's frame on the left,
// so the owner sits on the right: any pair not marked side L). A later render in the same run whose hook type the run's
// own pairs play gets those again when the rotation has none left (it skips what this run just delivered).
async function pairFor(look: Look, hookType: string, t: Thumb | null): Promise<PairRow | string> {
  const fits = (side: string) => look !== "call" || !String(side ?? "").toUpperCase().startsWith("L");
  const r = await connector<PickResult>("thumb_pick", { hook_type: hookType, limit: 6 });
  const rows = (r.pairs ?? []).filter((p) => fits(p.side));
  const row = rows[0];
  if (row) return row;
  const mine = used(t).find((p) => p.hook_types.includes(hookType) && fits(p.side));
  if (mine) return { pair_id: mine.id, background_id: mine.background, background_label: mine.label, cutout: mine.cutout, side: mine.side, hook_types: mine.hook_types, frame: { prop_xy: mine.prop ? true : null }, storage_prefix: mine.storage_prefix };
  return look === "call" && r.pairs?.length ? `no photo of ${OWNER} that sits on the right plays a ${hookType} hook (the call needs the right side)`
    : `no photo of ${OWNER} plays a ${hookType} hook right now`;
}

// Delivered or published pairs, two per call (the connector's limit).
export async function logThumbUse(pairs: string[], runKey: string, status: "delivered" | "published", title: string) {
  const ids = [...new Set(pairs)];
  for (let i = 0; i < ids.length; i += 2) await connector<{ recorded: number }>("thumb_use", { pair_ids: ids.slice(i, i + 2), run_key: runKey, status, title: title.slice(0, 300) });
}

// The reference frames for the feed sheet (other channels' thumbnails to compare against). None ship with the kit; the
// engine makes the sheet without them.
export async function referenceLinks(): Promise<Record<string, string>> {
  return {};
}

// The look to suggest: the one published least lately across the other episodes (never published comes first).
export async function lookOrder(episodeId: string): Promise<Look[]> {
  const { data } = await db().from("studio_pieces").select("episode_id, look:media->thumb->picked->>look, at:media->thumb->picked->>at")
    .eq("kind", "episode").neq("episode_id", episodeId).not("media->thumb->picked->>look", "is", null).limit(1000);
  const last: Partial<Record<Look, number>> = {};
  for (const r of (data ?? []) as { look: string; at: string | null }[]) {
    const l = r.look as Look, at = Date.parse(r.at ?? "") || 0;
    if (LOOKS.includes(l) && at > (last[l] ?? -1)) last[l] = at;
  }
  return [...LOOKS].sort((a, b) => (last[a] ?? -1) - (last[b] ?? -1) || LOOKS.indexOf(a) - LOOKS.indexOf(b));
}

async function engineFile() {
  // no `search`: Storage matches it against the start of the name, and every upload starts with its timestamp, so it
  // never found the engine (2026-11-07: "The thumbnail builder file isn't uploaded" with one uploaded)
  const { data } = await storage().list("uploads", { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  const f = (data ?? []).find((x) => x.id && /thumb-engine.*\.tgz$/.test(x.name));
  if (!f) throw new RangeError("The thumbnail builder file isn't uploaded.");
  const { data: u, error } = await storage().createSignedUrl(`uploads/${f.name}`, 3600);
  if (error) throw error;
  return u!.signedUrl;
}

// ---- the episode ----
type Ep = Awaited<ReturnType<typeof loadEpisode>>;
async function loadEpisode(id: string) {
  const sb = db();
  const [ep, pc, files, feeds] = await Promise.all([
    sb.from("studio_episodes").select("id, title, guest, show, kind, full_edit").eq("id", id).single(),
    sb.from("studio_pieces").select("id, media").eq("episode_id", id).eq("kind", "episode").order("num").limit(1).maybeSingle(),
    storage().list(`episodes/${id}`, { limit: 200 }),
    episodeFeeds(id),
  ]);
  if (ep.error) throw ep.error;
  if (pc.error) throw pc.error;
  const media = (pc.data?.media ?? {}) as { video?: string; plan?: string; thumb?: Thumb & { v?: number } };
  const fe = (ep.data.full_edit ?? null) as { status?: string; job?: string; at?: string } | null;
  // produced: the engine's episode is ready (it's the episode piece's video once marked made)
  const job = fe?.status === "ready" && String(fe.job ?? "").startsWith("fulledit-") ? String(fe.job) : null;
  const tx = pickTranscript((files.data ?? []).filter((f) => f.id));
  // the guest: the person on the call who isn't the host, with their own camera track (a masterclass has none)
  const guest = people(feeds).find((p) => !p.host && p.video) ?? null;
  return {
    id, ep: ep.data as { id: string; title: string; guest: string | null; show: string; kind?: string | null },
    piece: pc.data ? pc.data.id as string : null,
    // 2.0 state (no v) is left behind: the 3.0 words and looks start over
    thumb: media.thumb?.v === 3 ? media.thumb : null,
    produced: !!media.video || !!job, producedAt: fe?.at ?? null,
    plan: media.plan ?? (job ? episodeOut(job).plan : null),
    transcript: tx ? `episodes/${id}/${tx.name}` : null,
    guest: guest ? { name: ep.data.guest || guest.person, video: guest.video!.path } : null,
  };
}

// The produced episode's title (the title card's, the one YouTube gets) and its chapters, when the editor's plan exists.
async function planOf(e: Ep) {
  if (!e.plan) return { title: e.ep.title, chapters: "" };
  const r = await storage().download(e.plan).catch(() => null);
  const plan = r?.data ? await r.data.text().then((t) => JSON.parse(t)).catch(() => ({})) : {};
  const chapters = (Array.isArray(plan.chapters) ? plan.chapters : []).map((c: { at: number; title: string }) => `${mmss(Number(c.at) || 0)} ${c.title}`).join("\n");
  return { title: String(plan.title || e.ep.title), chapters };
}

async function transcriptText(path: string) {
  const r = await storage().download(path);
  if (!r.data) throw new RangeError("The transcript didn't download.");
  const { lines } = parseTranscript(await r.data.text());
  return lines.map((l) => `[${mmss(l.t)}] ${l.who ? `${l.who}: ` : ""}${l.text}`).join("\n");
}

// Read-modify-write of media.thumb, nothing else in media changes. `fn` returns the next state, or null to leave it.
// The write only lands if media.thumb is still the version read (rev), so two open tabs never both finish one job.
async function saveThumb(pieceId: string, fn: (t: Thumb | null) => Thumb | null): Promise<{ thumb: Thumb | null; wrote: boolean }> {
  const sb = db();
  for (let i = 0; i < 3; i++) {
    const { data, error } = await sb.from("studio_pieces").select("media").eq("id", pieceId).single();
    if (error) throw error;
    const media = (data.media ?? {}) as Record<string, unknown> & { thumb?: Thumb & { v?: number } };
    const raw = media.thumb ?? null;
    const cur = raw?.v === 3 ? (JSON.parse(JSON.stringify(raw)) as Thumb) : null;
    const next = fn(cur);
    if (!next) return { thumb: cur, wrote: false };
    next.v = 3;
    next.rev = (raw?.rev ?? 0) + 1;
    let q = sb.from("studio_pieces").update({ media: { ...media, thumb: next } }).eq("id", pieceId);
    q = !raw ? q.is("media->thumb", null) : raw.rev == null ? q.is("media->thumb->>rev", null) : q.filter("media->thumb->>rev", "eq", String(raw.rev));
    const { data: done, error: e2 } = await q.select("id");
    if (e2) throw e2;
    if (done?.length) return { thumb: next, wrote: true };
  }
  return { thumb: null, wrote: false };
}

const fresh = (e: Ep, t: Thumb | null): Thumb => t ?? { v: 3, rev: 0, run_key: `${now().slice(0, 10)}-${slug(e.ep.title)}` };
const upsert = (list: ThumbRender[] = [], r: ThumbRender) => [...list.filter((x) => x.option !== r.option), r].sort((a, b) => a.option - b.option);

// ---- starting the machines ----
// Claude finds the biggest takeaway and writes three options (hook-maker 1.5, destination YouTube) from the transcript,
// the produced title and the brain doc "Thumbnails".
export async function startWords(id: string, opts: { claimed?: boolean; notes?: string } = {}) {
  const e = await loadEpisode(id);
  if (!e.piece) throw new RangeError("This episode has no full-episode piece.");
  if (!e.transcript) throw new RangeError("Add the transcript first: the thumbnail words come from it.");
  const at = now();
  if (!opts.claimed) {
    // new words start the options over: the old thumbnails belonged to the old words (the owner's pick is already logged)
    const c = await saveThumb(e.piece, (t) => (t?.words?.status === "running" ? null : { ...fresh(e, t), words: { status: "running", job: "", at, log: "starting the machine" }, renders: [], current: undefined, auto: false, picked: null }));
    if (!c.wrote) throw new RangeError("The thumbnail words are being written already.");
  }
  try {
    const [engine, text, plan, types] = await Promise.all([engineFile(), transcriptText(e.transcript), planOf(e), playable(e.thumb)]);
    const job = `thumbs-${Date.now()}`;
    const o = thumbOut(job);
    const [log, out] = await Promise.all([storage().createSignedUploadUrl(o.log), storage().createSignedUploadUrl(o.words, { upsert: true })]);
    if (log.error || out.error) throw log.error ?? out.error;
    const context = {
      mode: "words", episode: { title: e.ep.title, guest: e.ep.guest, show: e.ep.show }, guest: e.guest?.name ?? "", title: plan.title,
      working_title: e.ep.title, chapters: plan.chapters, transcript: text, playable: types, notes: opts.notes ?? "",
    };
    await startJob(job, THUMBS, {
      MODE: "words", ENGINE_URL: engine, OUT_LOG: log.data!.signedUrl, OUT_WORDS: out.data!.signedUrl,
      ...engineEnv(),
    }, 2, 30, [{ path: "/tmp/job/context.json", content: JSON.stringify({ ...context, studio: studioContext() }) }]);
    await saveThumb(e.piece, (t) => ({ ...fresh(e, t), words: { status: "running", job, at, log: "" } }));
    return job;
  } catch (err) {
    const msg = safeError(err).slice(0, 200);
    await saveThumb(e.piece, (t) => ({ ...fresh(e, t), words: { status: "failed", job: "", at, log: `FAILED to start: ${msg}` } }));
    throw err;
  }
}

// One option, every look it has words for: the pairs picked and signed here, the guest's camera signed for the call,
// the words fitted, rendered and checked on the machine. The look published least lately goes first.
export async function startRender(id: string, n: number, opts: { claimed?: boolean } = {}) {
  const e = await loadEpisode(id);
  const opt = e.thumb?.words?.options?.find((o) => o.n === n);
  if (!e.piece || !opt) throw new RangeError("Write the thumbnail words first.");
  const at = now();
  if (!opts.claimed) {
    const c = await saveThumb(e.piece, (t) => (t?.renders?.some((r) => r.option === n && r.status === "running") ? null
      : { ...fresh(e, t), current: n, renders: upsert(t?.renders, { option: n, status: "running", job: "", at, log: "starting the machine" }) }));
    if (!c.wrote) throw new RangeError(`Option ${n} is being made already.`);
  }
  try {
    const order = await lookOrder(id);
    // what the app already knows can't play, and the pair for every look that can
    const skip: Partial<Record<Look, string>> = {};
    const rows: Partial<Record<Look, PairRow>> = {};
    for (const look of LOOKS) {
      const w = opt.looks.find((l) => l.look === look);
      if (!w) continue;
      if (look === "call" && !e.guest) { skip.call = "no guest camera on this episode (a masterclass has no call)"; continue; }
      if (look === "call" && opt.guest_at == null) { skip.call = "the words have no guest moment for the call window"; continue; }
      const p = await pairFor(look, w.hook_type, e.thumb);
      if (typeof p === "string") skip[look] = p; else rows[look] = p;
    }
    const picked = Object.values(rows);
    if (!picked.length) throw new RangeError(`None of the looks can play option ${n}: ${Object.entries(skip).map(([l, why]) => `${LOOK_NAME[l as Look]}, ${why}`).join("; ") || "it has no words for any look"}.`);
    const [engine, signed, refs, plan, text, gv] = await Promise.all([
      engineFile(), signPairs([...new Map(picked.map((r) => [r.pair_id, r])).values()]), referenceLinks(), planOf(e),
      e.transcript ? transcriptText(e.transcript) : Promise.resolve(""),
      rows.call && e.guest ? storage().createSignedUrl(e.guest.video, 3 * 3600) : Promise.resolve(null),
    ]);
    if (gv?.error) throw gv.error;
    const byId = new Map(signed.map((p) => [p.id, p]));
    const pairs = Object.fromEntries(Object.entries(rows).map(([l, r]) => [l, byId.get(r!.pair_id)])) as Partial<Record<Look, SignedPair>>;
    const job = `thumbs-${Date.now()}`;
    const o = thumbOut(job);
    const files: [string, string][] = [["OUT_LOG", o.log], ["OUT_RESULT", o.result], ["OUT_GUEST", o.guest]];
    for (const l of LOOKS) {
      const f = o.look(l);
      files.push([`OUT_THUMB_${l.toUpperCase()}`, f.thumb], [`OUT_REVIEW_${l.toUpperCase()}`, f.review], [`OUT_FEED_${l.toUpperCase()}`, f.feed], [`OUT_GATE_${l.toUpperCase()}`, f.gate]);
    }
    const ups = await Promise.all(files.map(([k, p]) => (k === "OUT_LOG" ? storage().createSignedUploadUrl(p) : storage().createSignedUploadUrl(p, { upsert: true }))));
    const bad = ups.find((u) => u.error);
    if (bad) throw bad.error;
    const env: Record<string, string> = {
      MODE: "render", ENGINE_URL: engine, ...engineEnv(),
    };
    files.forEach(([k], i) => { env[k] = ups[i].data!.signedUrl; });
    const run_key = fresh(e, e.thumb).run_key;
    const context = {
      mode: "render", episode: { title: e.ep.title, guest: e.ep.guest, show: e.ep.show }, guest: e.guest?.name ?? "", title: plan.title,
      takeaway: e.thumb?.words?.takeaway ?? "", transcript: text, option: opt, order, pairs, skip, run_key, refs,
      guest_video: gv?.data ? { url: gv.data.signedUrl, name: e.guest!.video.split("/").pop() } : null,
    };
    await startJob(job, THUMBS, env, 4, 30, [{ path: "/tmp/job/context.json", content: JSON.stringify({ ...context, studio: studioContext() }) }]);
    const ref = (p: SignedPair): PairRef => ({ id: p.id, background: p.background_id, label: p.background_label, cutout: p.cutout, side: p.side, hook_types: p.hook_types, prop: !!p.frame?.prop_xy, storage_prefix: p.storage_prefix });
    const refs3 = Object.fromEntries(Object.entries(pairs).map(([l, p]) => [l, ref(p!)])) as Partial<Record<Look, PairRef>>;
    await saveThumb(e.piece, (t) => ({ ...fresh(e, t), current: n, renders: upsert(t?.renders, { option: n, status: "running", job, at, log: "", order, pairs: refs3, skip }) }));
    return job;
  } catch (err) {
    const msg = safeError(err).slice(0, 300);
    await saveThumb(e.piece, (t) => ({ ...fresh(e, t), current: n, renders: upsert(t?.renders, { option: n, status: "failed", job: "", at, log: `FAILED to start: ${msg}` }) }));
    throw err;
  }
}

// The owner's pick: one look of one option, logged as published for the rotation (the photo and the look it used come
// round later). The owner uploads it to YouTube.
export async function pickThumb(id: string, look: Look, option: number | undefined, by: string) {
  const e = await loadEpisode(id);
  const t = e.thumb;
  const n = option ?? t?.current;
  const r = t?.renders?.find((x) => x.option === n);
  if (!e.piece || !t || !r || r.status !== "ready") throw new RangeError("Make the thumbnails first.");
  const res = r.result?.looks?.[look];
  if (!res || res.status !== "delivered" || !res.pair) throw new RangeError(`${LOOK_NAME[look]} didn't pass its checks. Pick another one.`);
  await logThumbUse([res.pair], t.run_key, "published", shown(res.words));
  const picked = { option: r.option, look, pair: res.pair, path: thumbOut(r.job).look(look).thumb, at: now(), by };
  await saveThumb(e.piece, (cur) => ({ ...fresh(e, cur), picked }));
}

// ---- the state the page shows; finishes jobs that stopped and starts what comes on its own ----
// Once the episode is produced (a recent one: two weeks), the words start without anyone asking, and option 1 is made
// as soon as they're in. `defer` runs work after the response (next/server's after()).
export async function refreshThumb(id: string, defer: (fn: () => Promise<unknown>) => void) {
  const e = await loadEpisode(id);
  if (!e.piece) return view(e, null, {});
  let t = e.thumb;
  const stale = (j: Job) => j.status === "running" && !j.job && Date.now() - new Date(j.at).getTime() > 10 * 60000;
  const lost = (j: Job) => Date.now() - new Date(j.at).getTime() > 45 * 60000;   // the machine's 30 minutes are long over
  const settle = async (job: string, j: Job) => {
    const s0 = await renderStatus(job);
    return !s0.done && lost(j) ? { status: `${s0.status}\nFAILED: the machine stopped without saying why. Try again.`, done: true, ok: false } : s0;
  };

  const w = t?.words;
  if (w && stale(w)) t = (await saveThumb(e.piece, (c) => (c?.words?.status === "running" && !c.words.job ? { ...c, words: { ...c.words, status: "failed", log: "FAILED: the machine didn't start. Try again." } } : null))).thumb ?? t;
  else if (w?.status === "running" && w.job) {
    const s = await settle(w.job, w);
    if (!s.done) t = { ...t!, words: { ...w, log: s.status } };
    else {
      let next: NonNullable<Thumb["words"]> = { ...w, status: s.ok ? "ready" : "failed", log: s.status };
      if (s.ok) {
        const f = await storage().download(thumbOut(w.job).words);
        const got = f.data ? await f.data.text().then((x) => JSON.parse(x)).catch(() => null) : null;
        next = got?.options?.length
          ? { ...next, takeaway: got.takeaway ?? "", takeaway_line: got.takeaway_line ?? "", options: got.options, notes: got.notes ?? "", dropped: got.dropped ?? [], title: got.title ?? "" }
          : { ...next, status: "failed", log: `${s.status}\nFAILED: the words file didn't come back` };
      }
      const r = await saveThumb(e.piece, (c) => (c?.words?.job === w.job && c.words.status === "running" ? { ...c, words: next } : null));
      t = r.thumb ?? t;
    }
  }

  for (const rd of t?.renders ?? []) {
    if (stale(rd)) {
      t = (await saveThumb(e.piece, (c) => (c ? { ...c, renders: (c.renders ?? []).map((x) => (x.option === rd.option && x.status === "running" && !x.job ? { ...x, status: "failed" as const, log: "FAILED: the machine didn't start. Try again." } : x)) } : null))).thumb ?? t;
      continue;
    }
    if (rd.status !== "running" || !rd.job) continue;
    const s = await settle(rd.job, rd);
    if (!s.done) { t = { ...t!, renders: t!.renders!.map((x) => (x.job === rd.job ? { ...x, log: s.status } : x)) }; continue; }
    const f = await storage().download(thumbOut(rd.job).result);
    const result = (f.data ? await f.data.text().then((x) => JSON.parse(x)).catch(() => null) : null) as Result | null;
    const delivered = LOOKS.filter((l) => result?.looks?.[l]?.status === "delivered" && result.looks[l]!.pair);
    const next: ThumbRender = { ...rd, status: s.ok && delivered.length ? "ready" : "failed", log: s.status, result: result ?? undefined };
    const r = await saveThumb(e.piece, (c) => (c?.renders?.some((x) => x.job === rd.job && x.status === "running") ? { ...c, renders: upsert(c.renders, next) } : null));
    t = r.thumb ?? t;
    // the delivered pairs, logged right away so the next thumbnail rotates past them
    if (r.wrote && next.status === "ready") {
      const words = delivered.map((l) => shown(result!.looks![l]!.words)).filter(Boolean).join(" | ");
      const ok = await logThumbUse(delivered.map((l) => result!.looks![l]!.pair!), t!.run_key, "delivered", words).then(() => true, (err) => { console.error("logging the thumbnail pairs failed:", safeError(err)); return false; });
      if (ok) t = (await saveThumb(e.piece, (c) => (c ? { ...c, renders: (c.renders ?? []).map((x) => (x.job === rd.job ? { ...x, logged: true } : x)) } : null))).thumb ?? t;
    }
  }

  const recent = !!e.producedAt && Date.now() - new Date(e.producedAt).getTime() < 14 * 86400000;
  if (e.produced && recent && e.transcript && e.ep.kind !== "idea" && !t?.words) {
    const at = now();
    const c = await saveThumb(e.piece, (x) => (x?.words ? null : { ...fresh(e, x), words: { status: "running", job: "", at, log: "starting the machine" } }));
    if (c.wrote) { t = c.thumb; defer(() => startWords(id, { claimed: true })); }
  }
  if (e.produced && t?.words?.status === "ready" && t.words.options?.length && !t.auto && !t.renders?.length) {
    const at = now();
    const c = await saveThumb(e.piece, (x) => (x && !x.auto && !x.renders?.length ? { ...x, auto: true, current: 1, renders: [{ option: 1, status: "running", job: "", at, log: "starting the machine" }] } : null));
    if (c.wrote) { t = c.thumb; defer(() => startRender(id, 1, { claimed: true })); }
  }

  const links = await signViews(t);
  return view(e, t, links);
}

async function signViews(t: Thumb | null) {
  const paths = (t?.renders ?? []).filter((r) => r.status !== "running" && r.job).flatMap((r) => {
    const o = thumbOut(r.job);
    return [o.guest, ...LOOKS.flatMap((l) => Object.values(o.look(l)))];
  });
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await storage().createSignedUrls(paths, 6 * 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl])) as Record<string, string>;
}

export type LookView = LookResult & { look: Look; name: string; label: string; image: string | null; review: string | null; feed: string | null; gate: string | null };
export type RenderView = { option: number; status: Job["status"]; log: string; at: string; suggested: Look | null; looks: LookView[]; notes: string[]; guest: GuestPick | null; guest_sheet: string | null };
export type ThumbView = {
  produced: boolean; transcript: boolean; guest: string | null;
  words: { status: Job["status"]; log: string; at: string; takeaway: string; takeaway_line: string; options: ThumbOption[]; notes: string; dropped: string[]; title: string } | null;
  current: number | null; renders: RenderView[]; picked: Thumb["picked"] | null;
};

function view(e: Ep, t: Thumb | null, links: Record<string, string>): ThumbView {
  const render = (r: ThumbRender): RenderView => {
    const o = r.job ? thumbOut(r.job) : null;
    const order = r.result?.order?.length ? r.result.order : r.order?.length ? r.order : [...LOOKS];
    const looks = order.map((l): LookView | null => {
      const res = r.result?.looks?.[l] ?? (r.skip?.[l] ? { status: "skipped" as const, reason: r.skip[l] } : null);
      if (!res || (res.status === "skipped" && /no words for it/.test(res.reason ?? ""))) return null;
      const f = o?.look(l);
      return {
        // the board sits on flat charcoal, so only the call and the wall name their room
        ...res, look: l, name: LOOK_NAME[l], label: l === "board" ? "" : res.background_label ?? r.pairs?.[l]?.label ?? "",
        image: f && res.status === "delivered" ? links[f.thumb] ?? null : null,
        review: f && res.status !== "skipped" ? links[f.review] ?? null : null, feed: f && res.status !== "skipped" ? links[f.feed] ?? null : null,
        gate: f && res.status !== "skipped" ? links[f.gate] ?? null : null,
      };
    }).filter(Boolean) as LookView[];
    return {
      option: r.option, status: r.status, log: r.log ?? "", at: r.at, suggested: order[0] ?? null, looks, notes: r.result?.notes ?? [],
      guest: r.result?.guest ?? null, guest_sheet: o && r.status !== "running" ? links[o.guest] ?? null : null,
    };
  };
  return {
    produced: e.produced, transcript: !!e.transcript, guest: e.guest?.name ?? null,
    words: t?.words ? {
      status: t.words.status, log: t.words.log ?? "", at: t.words.at, takeaway: t.words.takeaway ?? "", takeaway_line: t.words.takeaway_line ?? "",
      options: t.words.options ?? [], notes: t.words.notes ?? "", dropped: t.words.dropped ?? [], title: t.words.title ?? "",
    } : null,
    current: t?.current ?? null,
    renders: (t?.renders ?? []).map(render),
    picked: t?.picked ?? null,
  };
}
