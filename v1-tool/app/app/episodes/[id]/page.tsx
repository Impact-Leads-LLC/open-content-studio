"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Preview from "../../components/Preview";
import CoachCard from "../../components/CoachCard";
import Glyph from "../../components/Glyph";
import Trim from "../../components/Trim";
import Lines from "../../components/Lines";
import ClipReview from "../../components/ClipReview";
import Caption from "../../components/Caption";
import GuestCard from "../../components/GuestCard";
import type { Guest, Handles } from "../../../lib/guests";
import SendCs from "../../components/SendCs";
import ImagePick from "../../components/ImagePick";
import { chosen } from "../../../lib/platforms";
import ReelChanges, { type Changes } from "../../components/ReelChanges";
import PodcastPublish from "../../components/PodcastPublish";
import FullEdit from "../../components/FullEdit";
import Thumbnail from "../../components/Thumbnail";
import VoiceOver from "../../components/VoiceOver";
import MomentCard, { ScoreBadge, MomentLine } from "../../components/MomentCard";
import { secs, clock } from "../../../lib/time";
import type { Line } from "../../../lib/transcript";
import type { Person } from "../../../lib/feeds";
import { C, HEAD, STATUS, VERDICT, GROUPS, GROUP, groupOf, btn, ghost, link, card, label, chip, input, who, isOwner, changed, kindName, stageText, type Group } from "../../../lib/ui";
import { OWNER, OWNER_FULL, COACH, SCHEDULER_NAME } from "../../../lib/brand";
import { AWARENESS, STAGE_LABEL, stageLine, isAnimated, type Awareness } from "../../../lib/stages";
import { uploadFile } from "../../../lib/upload";
import { DOCX, docxTranscript } from "../../../lib/docx";
import { drafting, type ViewPiece, type Note } from "../../../lib/types";
import type { MomentsRun as Run } from "../../../lib/concepts";
import { MomentsRun, isRunning } from "../../components/MomentsRun";
import { slotStamp, toSlotInput, fromSlotInput } from "../../../lib/cadence";

type File = { path: string; name: string; size: number; type: string; url: string | null };
type Full = { path: string; name: string; size: number; url: string | null };
type Stack = { status: "running" | "ready" | "failed"; log: string; url: string | null; at: string };
type Transcribe = { status: "running" | "ready" | "failed"; log: string; at: string; sources: string[]; found: boolean };
type Edit = { status: "running" | "ready" | "failed"; log: string; at: string; path: string; start: number | null; end: number | null; from?: number; notes?: string; chapters?: string; srt?: string | null; sheet?: string | null };
type Data = { episode: { id: string; title: string; guest: string | null; show: string; guest_handles?: Handles | null; link?: string | null; kind?: string | null; moments?: Run | null }; link: string | null; files: File[]; fulls: Full[]; feeds: Person[]; stack: Stack | null; transcribe: Transcribe | null; full_edit: Edit | null; lines: Line[]; rough: boolean; exact?: boolean; pieces: ViewPiece[]; renders: string[] };
const MEDIA = /\.(mp4|mov|m4v|webm|mkv|wav|mp3|m4a|aac|flac|ogg)$/i;
const TEXT = /\.(srt|vtt|txt)$/i;
const MADE = ["draft", "changes", "ready", "approved", "scheduled", "posted"];
const NOTE_KIND: Record<string, string> = { sendback: "sent it back", approve: "approved", answer: `answered ${COACH}`, coach: "reviewed", fix: "rewrote it", drop: "dropped it", note: "" };
// The owner answered the coach's question and the piece hasn't been reviewed since: the team's next step.
const fresh = (p: ViewPiece) => !!p.answer && (!p.review || new Date(p.answer.at) > new Date(p.review.at));
// A reel that just finished rendering: the coach reviews it on its own, in the background, for a minute or two.
// The coach's fixes for a reel, written as notes for the editor's next render.
// What "Make the reel" does for an animated reel (lib/animated.ts).
const ANIM_NOTE = `The animated reel editor times every beat to your voiceover (or, with no take, sets it at reading pace), then renders it on a cloud machine. About 10 minutes, then ${COACH} reviews it.`;
const fixNotes = (p: ViewPiece) => (p.review?.fixes ?? []).map((f) => `${f.where}: ${f.problem}${f.after ? ` Instead: ${f.after}` : ""}`).join("\n");
const autoReview = (p: ViewPiece) => !!p.media?.reviewing_since && !p.review && Date.now() - new Date(p.media.reviewing_since).getTime() < 6 * 60000;
// A piece that was made (written, rendered or given slides): taking it off the board and back keeps that work.
const wasMade = (p: ViewPiece) => !!(p.body || p.media?.video || p.media?.slides?.length);
// A slide plan, one line per slide, without the "Slide 3," in front.
const planLines = (o: string) => o.split("\n").map((l) => l.replace(/^\s*(slide\s*\d+[,:.)]?|\d+[.)])\s*/i, "").trim()).filter(Boolean);
const mb = (n: number) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : `${(n / 1048576).toFixed(1)} MB`);
// Riverside's separate tracks ("riverside_sam_rivera_raw-video-cfr_..." or "sam_5_06-26-2026_121355.mp4", person_take_
// date_time) go to the camera feeds; a screen share ("sam-screen_5_...") and everything else is material.
const FEED = /^riverside[_-].*[_-]raw[_-](video|audio)|^(?!.*screen_\d+_).+?_\d+_\d{2}-\d{2}-\d{4}_\d{6}/i;
const TABS: [string, string][] = [["reel", "Reels"], ["carousel", "Carousels"], ["post", "Posts"], ["episode", "Full episode"]];
const area = { ...input, padding: 10, minHeight: 90, font: "14px/1.5 Poppins, Arial, sans-serif" } as const;

// A reel's moment: the cut it has, or the idea's start and end, or (with no end) the first sentence 35 seconds in.
function momentOf(p: ViewPiece, lines: Line[]): [number, number] {
  if (p.media?.cut) return [p.media.cut.start, p.media.cut.end];
  const a = Number.isFinite(secs(p.source_time)) ? secs(p.source_time) : 0;
  const e = secs(p.source_end);
  if (Number.isFinite(e) && e > a) return [a, e];
  const l = lines.find((x) => x.t >= a + 35);
  return [a, l && l.t - a <= 70 ? l.t : a + 45];
}

function Step({ n, title, note }: { n: number; title: string; note?: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ font: `800 12px/20px ${HEAD}`, minWidth: 20, textAlign: "center", color: "#fff", background: C.navy, borderRadius: 4 }}>{n}</span>
      <span style={{ font: `800 15px ${HEAD}` }}>{title}</span>
      {note && <span style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>{note}</span>}
    </div>
  );
}

export default function Episode() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Data | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [gfilter, setGfilter] = useState<Group | "">("");
  // the awareness stage the board shows (lib/stages.ts), across every type of content
  const [stage, setStage] = useState<Awareness | "" | "none">("");
  const [showKilled, setShowKilled] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [clip, setClip] = useState("");
  const [render, setRender] = useState("");
  const [slides, setSlides] = useState<string[]>([]);
  const [when, setWhen] = useState("");
  const [chans, setChans] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [edit, setEdit] = useState(false);
  const [instr, setInstr] = useState("");
  const [why, setWhy] = useState("");
  const [remake, setRemake] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState("");
  const [add, setAdd] = useState<{ kind: string; title: string; source_time: string; awareness?: string } | null>(null);
  const [sending, setSending] = useState<{ name: string; done: number; total: number } | null>(null);
  const [trimOpen, setTrimOpen] = useState(false);
  const [enotes, setEnotes] = useState("");
  // The part of the episode picked in step 1, for the piece it was picked on.
  const [range, setRange] = useState<{ id: string; s: number; e: number; problem: string } | null>(null);
  // A carousel's slide plan, while someone edits it.
  const [editPlan, setEditPlan] = useState(false);
  const [planText, setPlanText] = useState("");
  const [fullPlan, setFullPlan] = useState(false);
  // Changing a made reel: which of the two ways is open, and the team's own words.
  const [chg, setChg] = useState<"" | "coach" | "own">("");
  const [own, setOwn] = useState("");
  const [told, setTold] = useState("");
  const chgRef = useRef<HTMLDivElement>(null);
  const openChanges = (w: "coach" | "own", text?: string) => {
    if (text !== undefined) setOwn(text);
    setChg(w);
    setTimeout(() => chgRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  // Video links are re-signed on every load; keep the first one per file so the players don't reload mid-trim.
  const urls = useRef(new Map<string, string>());
  const keep = (key: string, url: string | null) => { if (!url) return url; const c = urls.current.get(key); if (c) return c; urls.current.set(key, url); return url; };
  const load = useCallback(async () => {
    const r = await fetch(`/api/episodes/${id}`).then((x) => x.json()).catch(() => ({ error: "Network error" }));
    if (r.error) return setNote(r.error);
    if (r.stack) r.stack.url = keep(`stack:${r.stack.at}`, r.stack.url);
    for (const f of r.fulls ?? []) f.url = keep(f.path, f.url);
    setD(r);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); const q = new URLSearchParams(window.location.search).get("piece"); if (q) setSelId(q); }, [load]);
  // A piece opens as its own page (?piece=), so the browser's back button returns to the board.
  useEffect(() => {
    const f = () => setSelId(new URLSearchParams(window.location.search).get("piece"));
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);
  const openPiece = (pid: string | null) => {
    setSelId(pid);
    const u = new URL(window.location.href);
    if (pid) u.searchParams.set("piece", pid); else u.searchParams.delete("piece");
    window.history.pushState({}, "", u);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    // keep checking while anything runs on a cloud machine, and while the moments are being found after a transcription
    const finding = (d?.transcribe?.found && !d.pieces.length && Date.now() - new Date(d.transcribe.at).getTime() < 3 * 3600000) || isRunning(d?.episode.moments);
    if (!d?.pieces.some((p) => p.status === "making" || autoReview(p) || drafting(p)) && d?.stack?.status !== "running" && d?.transcribe?.status !== "running" && d?.full_edit?.status !== "running" && !finding) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [d, load]);

  const loadNotes = useCallback(async (pid: string) => {
    const r = await fetch(`/api/pieces/${pid}/notes`).then((x) => x.json()).catch(() => ({}));
    setNotes(r.notes ?? []);
  }, []);
  const sel = d?.pieces.find((p) => p.id === selId) ?? null;
  useEffect(() => {
    if (!sel) return;
    setText(sel.body ?? ""); setEdit(false); setInstr(""); setWhy(""); setRemake(false); setClip(sel.media?.clip ?? ""); setTrimOpen(false); setEnotes(sel.editor_notes ?? ""); setEditPlan(false); setChg(""); setOwn(""); setTold("");
    setChans(chosen(sel.kind, sel.channels, !!sel.media?.image));
    setWhen(sel.scheduled_at ? toSlotInput(sel.scheduled_at) : "");
    loadNotes(sel.id);
  }, [selId, sel?.id, loadNotes]); // eslint-disable-line react-hooks/exhaustive-deps
  // the channels follow the piece when they change elsewhere (attaching an image to a post adds Instagram)
  useEffect(() => { if (sel) setChans(chosen(sel.kind, sel.channels, !!sel.media?.image)); }, [sel?.channels?.join(), sel?.media?.image]); // eslint-disable-line react-hooks/exhaustive-deps

  // Material (transcript, clips, images) or the full episode. Big files go up in resumable pieces with a progress bar.
  async function upload(files: FileList | null, full = false) {
    if (!files?.length) return;
    setNote("");
    try {
      for (const f of Array.from(files)) {
        setSending({ name: f.name, done: 0, total: f.size });
        await uploadFile(f, { episodeId: id, full }, (done, total) => setSending({ name: f.name, done, total }));
      }
      setNote(full ? "Full episode uploaded. Pick a reel to cut its clip." : "Uploaded.");
    } catch (e) {
      setNote(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSending(null);
    if (Array.from(files).some((f) => MEDIA.test(f.name)) && !Array.from(files).some((f) => TEXT.test(f.name))) await transcribe(); else load();
  }
  // Raw video or audio with no transcript, or camera feeds with only a rough one (a Word or text transcript): transcribe
  // it on a cloud machine; the moments are found, or moved to the exact times, when it's done.
  async function transcribe() {
    const r = await fetch(`/api/episodes/${id}`).then((x) => x.json()).catch(() => null);
    if ((r?.files?.some((f: File) => f.type === "transcript") && (r.exact || !r.feeds?.length)) || r?.transcribe?.status === "running") return load();
    await call(`/api/episodes/${id}/transcribe`, "POST", undefined, "Starting the transcription…");
  }
  // Riverside's separate tracks (each person's camera and microphone) plus the .srt: footage goes to the feeds folder,
  // text to the material; then the whole episode gets stacked for the trim player.
  async function uploadFeeds(files: FileList | null) {
    if (!files?.length) return;
    setNote("");
    let feeds = 0;
    try {
      for (const f of Array.from(files)) {
        setSending({ name: f.name, done: 0, total: f.size });
        const text = TEXT.test(f.name);
        await uploadFile(f, { episodeId: id, feed: !text }, (done, total) => setSending({ name: f.name, done, total }));
        if (!text) feeds++;
      }
    } catch (e) {
      setNote(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSending(null);
    if (feeds) { await restack(); await transcribe(); } else load();
  }
  const restack = () => call(`/api/episodes/${id}/stack`, "POST", undefined, "Starting the stacked preview of the whole episode…");
  // Camera feeds with only a rough transcript (a Word or text file): the tracks get transcribed on their own, once per
  // visit and not right after a failed try, so the moments move to exact times without anyone asking.
  const autoTx = useRef(false);
  useEffect(() => {
    if (!d || autoTx.current || busy || sending) return;
    const rough = d.files.some((f) => f.type === "transcript") && !d.exact && d.feeds.some((p) => p.audio || p.video);
    const failedLately = d.transcribe?.status === "failed" && Date.now() - new Date(d.transcribe.at).getTime() < 3 * 3600000;
    if (!rough || d.transcribe?.status === "running" || failedLately) return;
    autoTx.current = true;
    transcribe();
  }, [d, busy, sending]); // eslint-disable-line react-hooks/exhaustive-deps
  // One way in for every file: camera tracks go to the feeds (and get stacked), the rest to the material. A transcript
  // on an episode with no pieces yet finds the moments straight away; a Word transcript goes up as plain text.
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const list: globalThis.File[] = [];
    for (const f of Array.from(files)) {
      if (!DOCX.test(f.name)) { list.push(f); continue; }
      try { list.push(await docxTranscript(f)); } catch (e) { setNote(`Error: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (!list.length) return;
    const pack = (arr: globalThis.File[]) => { const t = new DataTransfer(); arr.forEach((f) => t.items.add(f)); return t.files; };
    const text = list.filter((f) => TEXT.test(f.name));
    const feedFiles = list.filter((f) => !TEXT.test(f.name) && FEED.test(f.name));
    const rest = list.filter((f) => !TEXT.test(f.name) && !FEED.test(f.name));
    // The transcript first, so nothing gets transcribed that has one; then the camera tracks, which transcribe each
    // person from their own sound; then the rest (a screen share has no sound, so it's never the one transcribed).
    if (text.length) await upload(pack(text));
    if (feedFiles.length) await uploadFeeds(pack(feedFiles));
    if (rest.length) await upload(pack(rest));
    // A rough transcript on an episode with camera feeds waits for the tracks' own transcript, which finds the moments
    // with exact times; captions (.srt, .vtt) are exact already.
    const roughWithCams = text.length > 0 && !text.some((f) => /\.(srt|vtt)$/i.test(f.name)) && (feedFiles.length > 0 || (d?.feeds.length ?? 0) > 0) && d?.transcribe?.status !== "failed";
    if (roughWithCams) await transcribe();
    else if (text.length && !d?.pieces.length) await call(`/api/episodes/${id}/concepts`, "POST", undefined, "Starting the Moment Coach…");
  }
  async function remove(path: string, name: string) {
    if (!window.confirm(`Remove ${name}? This deletes the file from storage.`)) return;
    await call(`/api/episodes/${id}/files`, "DELETE", { path }, `Removing ${name}…`);
  }
  // One button makes the reel: cut the picked part out of the episode (unless the clip already matches it), then
  // start the cloud editor on that clip.
  async function makeReel(pid: string, source: string, pick: { s: number; e: number } | null, reuse: string | null, notes: string) {
    let c = reuse;
    if (!c && pick) {
      const r = await call(`/api/pieces/${pid}/cut`, "POST", { source, start: pick.s, end: pick.e, author: who() }, `Step 1 of 2: cutting ${clock(pick.s)} to ${clock(pick.e)} out of the episode (about two minutes)…`);
      if (!r.clip) return;
      c = r.clip; setClip(r.clip); setTrimOpen(false); loadNotes(pid);
    }
    if (c) await make(pid, { clip: c, notes }, "Step 2 of 2: starting the cloud editor…");
  }

  // Change a made reel without starting over. The change route makes caption changes and works out the clip; when the
  // change needs more of the episode, the longer clip is cut first; then the editor starts from the last edit.
  async function changeReel(p: ViewPiece, c: Changes) {
    setTold("");
    const r = await call(`/api/pieces/${p.id}/change`, "POST", c, c.note ? "Reading your changes…" : `Working out ${COACH}'s changes…`);
    if (r.error) return;
    setChg(""); if (c.note) setOwn("");
    setTold(r.reply ?? "");
    if (r.render) {
      let clipPath = p.media?.clip ?? "";
      if (r.render.cut) {
        const k = await call(`/api/pieces/${p.id}/cut`, "POST", { source: r.render.cut.source === "feeds" ? "" : r.render.cut.source, start: r.render.cut.start, end: r.render.cut.end, author: who() }, `Step 1 of 2: cutting the longer clip from the episode (about two minutes)…`);
        if (!k.clip) return;
        clipPath = k.clip; setClip(k.clip);
      }
      await call(`/api/pieces/${p.id}/make`, "POST", { clip: clipPath, revise: { change: r.render.change, from: r.render.from, reply: r.reply } }, `${r.render.cut ? "Step 2 of 2: s" : "S"}tarting the editor…`);
    }
    loadNotes(p.id);
  }

  async function call(url: string, method: string, body?: unknown, wait = "") {
    setBusy(wait || "Working…"); setNote("");
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
    setBusy("");
    if (r.error) setNote(`Error: ${r.error}`);
    await load(); changed();
    return r;
  }
  const patch = (pid: string, body: unknown) => call(`/api/pieces/${pid}`, "PATCH", body);
  async function ask(pid: string) {
    setReviewing(pid);
    await call(`/api/pieces/${pid}/review`, "POST", undefined, `${COACH} is checking it against ${OWNER}'s standard (about a minute)…`);
    setReviewing(null); loadNotes(pid);
  }
  async function make(pid: string, body: unknown, wait: string) {
    const r = await call(`/api/pieces/${pid}/make`, "POST", body, wait);
    if (r.piece?.status === "draft") await ask(pid);
  }
  async function writePlan(pid: string) {
    await call(`/api/pieces/${pid}/outline`, "POST", undefined, "Planning the slides from the episode (about a minute)…");
    setEditPlan(false); loadNotes(pid);
  }
  async function fix(pid: string, instruction: string) {
    const r = await call(`/api/pieces/${pid}/revise`, "POST", { instruction, author: who() }, `Rewriting it with ${COACH}'s fixes (about a minute)…`);
    if (r.piece) { setText(r.piece.body ?? ""); setInstr(""); await ask(pid); }
  }
  async function useHook(h: string) {
    if (!sel?.body) return;
    const body = [h, ...sel.body.split(/\n\s*\n/).slice(1)].join("\n\n");
    setText(body);
    await patch(sel.id, { body });
  }
  async function decide(pid: string, decision: string, extra: Record<string, unknown> = {}) {
    await call(`/api/pieces/${pid}/decide`, "POST", { decision, author: who(), ...extra });
    loadNotes(pid);
  }
  async function addNote(pid: string) {
    const r = await fetch(`/api/pieces/${pid}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: noteText, author: who() }) }).then((x) => x.json());
    if (r.error) return setNote(`Error: ${r.error}`);
    setNoteText(""); loadNotes(pid);
  }

  if (!d) return <main style={{ padding: 28 }}>{note || "Loading…"}</main>;
  // A standalone idea: no video, so no times on its pieces, and its reels are animated (no camera footage to cut).
  const idea = d.episode.kind === "idea";
  const anim = (p: ViewPiece) => isAnimated(p, d.episode.kind);
  const selAnim = !!sel && anim(sel);
  const clips = d.files.filter((f) => f.type === "clip");
  const images = d.files.filter((f) => f.type === "image").sort((a, b) => a.name.localeCompare(b.name));
  const hasTranscript = d.files.some((f) => f.type === "transcript");
  const count = (f: (p: ViewPiece) => boolean) => d.pieces.filter(f).length;
  // The files, in one line: what's here and how much room it takes.
  const cams = d.feeds.filter((p) => p.video).length;
  const bytes = d.files.reduce((a, f) => a + f.size, 0) + d.fulls.reduce((a, f) => a + f.size, 0) + d.feeds.reduce((a, p) => a + (p.video?.size ?? 0) + (p.audio?.size ?? 0), 0);
  const filesLine = [cams ? `${cams} camera${cams > 1 ? "s" : ""}` : "", hasTranscript ? "transcript" : "", clips.length ? `${clips.length} clip${clips.length > 1 ? "s" : ""}` : "", images.length ? `${images.length} image${images.length > 1 ? "s" : ""}` : "", d.fulls.length ? "full episode" : ""].filter(Boolean).join(" · ");
  const filesText = filesLine ? `${filesLine} · ${mb(bytes)}` : "No files yet. Add Riverside's camera tracks and the transcript, or any video or audio.";
  // One type of content at a time, sorted by where each piece stands, then the Moment Coach's score; killed ones fold away.
  const tabKind = filter !== "all" ? filter : TABS.map(([k]) => k).find((k) => d.pieces.some((p) => p.kind === k)) ?? "reel";
  const rank = (p: ViewPiece) => GROUPS.findIndex((g) => g.id === groupOf(p.status));
  const ofKind = d.pieces.filter((p) => p.kind === tabKind && (!gfilter || groupOf(p.status) === gfilter) && (!stage || (stage === "none" ? !p.awareness : p.awareness === stage))).sort((a, b) => rank(a) - rank(b) || (b.moment?.score ?? -1) - (a.moment?.score ?? -1) || a.num - b.num);
  const live = ofKind.filter((p) => p.status !== "skipped"), killed = ofKind.filter((p) => p.status === "skipped");
  const cardOf = (p: ViewPiece) => {
    const g = GROUP[groupOf(p.status)], st = STATUS[p.status] ?? STATUS.draft;
    // a posted piece whose files were cleared shows no picture on its card
    const cleared = !!p.media?.retention;
    const meta = `${kindName(p, anim(p))}${idea ? "" : p.kind === "reel" && p.source_time ? ` · ${momentOf(p, d.lines).map((t) => clock(t).replace(/\.\d$/, "")).join(" to ")}` : p.source_time ? ` · from ${p.source_time}` : ""}`;
    return (
      <article key={p.id} onClick={() => { setFilter(p.kind); openPiece(p.id); }} className="card-h" style={{ ...card, padding: 16, cursor: "pointer", background: g.bg, border: g.border, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Glyph kind={p.kind} />
          <span style={{ font: `800 18px ${HEAD}`, letterSpacing: "-0.02em" }}>#{p.num}</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>{p.moment && p.status !== "skipped" && <ScoreBadge m={p.moment} />}<span style={chip(st)}>{st.label}</span></span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.title}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{meta}</div>
        {stageLine(p) && <div style={stageText}>{stageLine(p)}</div>}
        {p.moment && ["concept", "kept"].includes(p.status) && <MomentLine m={p.moment} />}
        {p.status === "concept" && p.hook && <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.hook}</div>}
        {!cleared && p.kind === "reel" && p.cover_url ? <img src={p.cover_url} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 4, background: "#000" }} />
          : !cleared && p.kind === "reel" && p.video_url && <video src={`${p.video_url}#t=0.5`} onError={(e) => { e.currentTarget.style.display = "none"; }} muted playsInline preload="metadata" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 4, background: "#000" }} />}
        {!cleared && p.kind === "carousel" && p.slide_urls?.[0] && <img src={p.slide_urls[0]} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", borderRadius: 4 }} />}
        {p.kind === "carousel" && !p.slide_urls?.length && p.outline && <div style={{ fontSize: 12, color: C.muted }}>{planLines(p.outline).length} slides planned</div>}
        {drafting(p) && p.status !== "skipped" && <div style={{ fontSize: 12, color: C.muted }}>Writing the {p.kind === "post" ? "post" : "caption"}…</div>}
        {p.review && groupOf(p.status) === "edit" && <div style={{ fontSize: 12, color: C.text }}>Coach {p.review.score}/100 · {VERDICT[p.review.verdict].label}</div>}
        {fresh(p) && p.status !== "skipped" && <div style={{ fontSize: 12, color: C.navy, fontWeight: 600 }}>{OWNER} answered. Work it in.</div>}
        {p.status === "scheduled" && p.scheduled_at && <div style={{ fontSize: 12.5, color: "#198754", fontWeight: 700 }}>{slotStamp(p.scheduled_at)}</div>}
        {p.kind !== "episode" && p.status === "concept" && (
          <div style={{ display: "flex", gap: 14, marginTop: "auto", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
            <button style={{ ...btn, flex: 1, minHeight: 40 }} onClick={() => patch(p.id, { status: "kept" })}>Keep</button>
            <button style={{ ...link, color: C.muted }} onClick={() => patch(p.id, { status: "skipped" })}>Kill</button>
          </div>
        )}
        {p.status === "kept" && <div style={{ marginTop: "auto" }} onClick={(e) => e.stopPropagation()}><button style={{ ...link, color: C.muted, fontSize: 13 }} onClick={() => patch(p.id, { status: "concept" })}>Undo keep</button></div>}
        {p.status === "skipped" && (
          <div style={{ marginTop: "auto" }} onClick={(e) => e.stopPropagation()}>
            <button style={{ ...ghost, width: "100%", minHeight: 38 }} disabled={!!busy} onClick={() => (wasMade(p) ? decide(p.id, "restore") : patch(p.id, { status: "concept" }))}>Bring it back</button>
          </div>
        )}
      </article>
    );
  };
  const made = sel ? MADE.includes(sel.status) : false;
  const guest: Guest = { name: d.episode.guest, handles: d.episode.guest_handles ?? {} };
  // a made reel changes through "Change this reel" and never starts over; posts and carousels can still be redone
  const canMake = sel && sel.kind !== "episode" && sel.status !== "making" && (!made || (sel.kind !== "reel" && (remake || sel.status === "changes")));
  const sentBack = [...notes].reverse().find((n) => n.kind === "sendback");
  // A reel's moment, and what "Make the reel" will use: the clip it has, or the part picked in step 1 (cut first).
  const reel = sel?.kind === "reel" && !selAnim ? (() => {
    const [a, b] = momentOf(sel, d.lines);
    const full = d.fulls[0];
    const src = d.stack?.url ?? full?.url ?? null;
    const srcKey = d.stack?.url ? `stack-${d.stack.at}` : full?.path ?? "";
    // With camera feeds, the cut always comes from them (both cameras, cropped to 9:16), so the player can be any of the
    // episode's videos: the stacked preview, or the full-episode edit, which starts a moment into the recording.
    const cams = d.feeds.some((p) => p.video);
    const offset = !d.stack?.url && full && d.full_edit?.path === full.path ? d.full_edit.from ?? 0 : 0;
    // camera feeds with a rough transcript: the moment's times are a guess until the tracks are transcribed
    const roughCams = cams && !d.exact;
    const stacking = cams && !src;
    // a posted piece whose files were cleared has no clip to show
    const hasClip = !!sel.media?.clip && !!sel.clip_url && !sel.media?.retention;
    const showClip = hasClip && !trimOpen;
    const have = sel.media?.cut;
    const pick = showClip || !src ? null : range?.id === sel.id ? range : { s: a, e: b, problem: "" };
    const same = hasClip && (showClip || (!!have && !!pick && Math.abs(pick.s - have.start) < 0.05 && Math.abs(pick.e - have.end) < 0.05));
    const ready = same || (!!pick && !pick.problem);
    const how = same ? `Uses the clip you have${have ? `, ${clock(have.start)} to ${clock(have.end)}` : ""}. The editor adds the graphics and captions.`
      : pick ? (pick.problem ? "Fix the start and end below first." : roughCams ? `The transcript's times are rough, so check ${clock(pick.s)} to ${clock(pick.e)} in the player first (or transcribe the camera tracks on the episode page). It's cut from both cameras in 9:16, then the editor makes the reel. About 10 minutes.` : cams ? `Cuts ${clock(pick.s)} to ${clock(pick.e)} from both cameras in 9:16, then the editor makes the reel: the camera follows whoever is talking, captions pop in word by word, plus a hook and brand graphics. About 10 minutes.` : `Cuts ${clock(pick.s)} to ${clock(pick.e)} out of the episode, then the editor adds the graphics and captions. About 10 minutes.`)
      : stacking ? "Ready when the stacked episode finishes, in a few minutes." : "Add the camera feeds first, or use a clip you uploaded.";
    const go = () => makeReel(sel.id, full?.path ?? "", same ? null : pick, same ? sel.media!.clip! : null, enotes);
    return { a, b, full, src, srcKey, cams, offset, roughCams, stacking, hasClip, showClip, pick, same, ready, how, go };
  })() : null;
  // The one button that moves the selected piece forward, by where it stands.
  type Next = { label: string; go?: () => void; note?: string; alt?: { label: string; go: () => void } };
  const next: Next | null = !sel || sel.kind === "episode" || sel.status === "skipped" ? null : (() => {
    const s = sel.status, r = sel.review;
    if (s === "making") return { label: sel.kind === "carousel" ? "Building on a cloud machine" : "Rendering on a cloud machine", note: `About 10 minutes. ${COACH} reviews it when it lands.` };
    if (s === "ready") return { label: `With ${OWNER}`, note: `Nothing to do until ${OWNER} decides.`, alt: { label: "Pull back to edit", go: () => patch(sel.id, { status: "draft" }) } };
    if (s === "approved" || s === "scheduled") return { label: s === "scheduled" ? "Scheduled" : `Approved by ${OWNER}`, note: `Send it to ${SCHEDULER_NAME} below.` };
    if (!made) {
      // Keeping a reel makes it: cut from the camera feeds, then the editor ("keep it" means make the reel)
      if (s === "concept" && selAnim) return { label: "Keep it and make the reel", go: async () => { await patch(sel.id, { status: "kept" }); await make(sel.id, { notes: enotes }, "Starting the animated reel editor…"); }, note: ANIM_NOTE, alt: { label: "Keep it for later", go: () => patch(sel.id, { status: "kept" }) } };
      if (s === "concept" && sel.kind === "reel" && reel?.ready && !reel.roughCams) return { label: "Keep it and make the reel", go: async () => { await patch(sel.id, { status: "kept" }); await reel.go(); }, note: reel.how, alt: { label: "Keep it for later", go: () => patch(sel.id, { status: "kept" }) } };
      if (s === "concept") return { label: "Keep it", go: () => patch(sel.id, { status: "kept" }), note: "Keeping it puts it on the team's list to make." };
      if (sel.kind === "post" && drafting(sel)) return { label: "Writing the post", note: `With the LinkedIn skill, then ${COACH}'s first look. A few minutes; it shows here when it's done.` };
      if (sel.kind === "post") return { label: "Write the post", go: () => make(sel.id, {}, "Writing the post with the LinkedIn skill (about a minute)…"), note: `Written with the LinkedIn skill, then ${COACH} reviews it.` };
      if (sel.kind === "carousel") return { label: "Build the carousel", go: () => make(sel.id, { notes: enotes }, "Starting the carousel builder…"), note: `${sel.outline ? "Follows the slide plan below" : "With no slide plan, the builder plans it itself"}. About 6 minutes, then ${COACH} reviews it.` };
      if (selAnim) return { label: "Make the reel", go: () => make(sel.id, { notes: enotes }, "Starting the animated reel editor…"), note: ANIM_NOTE };
      if (sel.kind === "reel") return { label: "Make the reel", go: reel?.ready ? reel.go : undefined, note: reel?.how };
    }
    if (fresh(sel)) return sel.kind === "post" && sel.body ? { label: `Rewrite with ${OWNER}'s answer`, go: () => fix(sel.id, `Work ${OWNER}'s answer in as their take, in their own words.`) }
      : sel.kind === "reel" ? { label: `Work in ${OWNER}'s answer`, go: () => openChanges("own", `Work in ${OWNER}'s answer as their take, in their own words: "${sel.answer!.body}"`), note: `${OWNER}'s answer goes into Your own edits. Say where it should go, then make the change.` }
      : { label: `Work in ${OWNER}'s answer`, note: `Put ${OWNER}'s words in the ${OWNER}'s take slide, then ask ${COACH} again.` };
    if (sel.kind === "reel" && s === "changes" && sentBack) return { label: `Make ${OWNER}'s changes`, go: () => openChanges("own", sentBack.body), note: `${OWNER} sent it back. The note goes into Your own edits; add to it if you need to.` };
    if (!r) return autoReview(sel) ? { label: `${COACH} is reviewing it`, note: "A minute or two." } : { label: `Ask ${COACH}`, go: () => ask(sel.id) };
    if (r.verdict === "ready") return { label: `Send to ${OWNER}`, go: () => decide(sel.id, "send"), note: `${COACH}: ready, ${r.score}/100.` };
    // the coach's question, when it asked one, waits in the owner's queue
    const asked = r.question ? ` Its question for ${OWNER} is in ${OWNER}'s queue.` : "";
    if (sel.kind === "reel") return r.fixes.length
      ? { label: `Go through ${COACH}'s suggestions`, go: () => openChanges("coach"), note: `${COACH}: ${r.verdict === "fix" ? "fix first" : "rethink"}, ${r.score}/100. Apply the ones you agree with and disregard the rest. The edit stays; only those change.${asked}` }
      : { label: "Make your own edits", go: () => openChanges("own"), note: `${COACH}: ${r.verdict === "fix" ? "fix first" : "rethink"}, ${r.score}/100.${asked}` };
    const fixGo = sel.kind === "post" ? () => fix(sel.id, "")
      : sel.kind === "carousel" ? () => { setEnotes(fixNotes(sel)); make(sel.id, { notes: fixNotes(sel) }, `Rebuilding with ${COACH}'s fixes…`); }
      : undefined;
    return { label: "Fix it for me", go: fixGo, note: `${COACH}: ${r.verdict === "fix" ? "fix first" : "rethink"}, ${r.score}/100. ${sel.kind === "post" ? "The writer rewrites it with the coach's fixes" : "It's rebuilt with the coach's fixes as notes"}, then the coach reviews it again.${asked}` };
  })();

  return (
    <>
      <section style={{ background: C.navy, color: "#fff" }}>
        <div style={{ maxWidth: 1500, margin: "0 auto", padding: "22px 24px 24px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 420px" }}>
            <div style={{ ...label, color: C.onNavy }}>{d.episode.show}{d.episode.guest ? ` · guest ${d.episode.guest}` : ""}</div>
            <h1 style={{ margin: "6px 0 0", font: `800 30px/1.15 ${HEAD}`, letterSpacing: "-0.025em" }}>{d.episode.title}</h1>
          </div>
          {/* the same four groups as the episode cards; each one filters the board */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
            {GROUPS.map((g) => {
              const n = count((p) => groupOf(p.status) === g.id), on = gfilter === g.id;
              return (
                <button key={g.id} onClick={() => { setGfilter(on ? "" : g.id); openPiece(null); }} aria-pressed={on} style={{ minWidth: 104, padding: "10px 14px", borderRadius: 6, cursor: "pointer", textAlign: "left", background: on ? "#fff" : C.navy2, color: on ? C.ink : "#fff", border: `2px solid ${on ? "#fff" : g.color}` }}>
                  <div style={{ font: `800 30px/1 ${HEAD}`, letterSpacing: "-0.04em" }}>{n}</div>
                  <div style={{ fontSize: 12, marginTop: 4, color: on ? C.muted : C.onNavy }}>{g.label}</div>
                </button>
              );
            })}
            {count((p) => p.status === "ready") > 0 && <span style={{ ...chip({ label: "", bg: C.accent, fg: C.accentInk }), alignSelf: "center" }}>{count((p) => p.status === "ready")} waiting for {OWNER}</span>}
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1500, margin: "0 auto", padding: "20px 24px 40px" }}>
        {(busy || note) && <div className="rise" style={{ ...card, padding: "10px 14px", marginBottom: 14, color: busy ? C.ink : C.warn, fontSize: 14, display: "flex", gap: 10, alignItems: "center" }}>{busy && <Glyph kind="coach" size={18} />}{busy || note}</div>}
        {/* one way in for every file; the pickers stay mounted so the reel steps can open them */}
        <input id="up" type="file" multiple hidden disabled={!!sending} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input id="feeds" type="file" multiple hidden accept="video/*,audio/*,.srt,.vtt,.txt,.docx" disabled={!!sending} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        {!sel && (
          <>
            {/* Files: one strip; the list and its Remove links sit in a drawer */}
            <div style={{ ...card, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Glyph kind="episode" size={18} />
              <span style={{ fontSize: 13.5, color: C.text, flex: "1 1 240px" }}>{filesText}</span>
              <label htmlFor="up" style={{ ...ghost, minHeight: 38 }}>Add files</label>
              {hasTranscript && <button style={{ ...ghost, minHeight: 38 }} disabled={!!busy || isRunning(d.episode.moments)} onClick={() => call(`/api/episodes/${id}/concepts`, "POST", undefined, "Starting the Moment Coach…")}>{isRunning(d.episode.moments) ? "Finding the moments…" : d.pieces.length ? "Find more moments" : "Find the moments"}</button>}
              <button style={{ ...link, fontSize: 13 }} onClick={() => setFilesOpen(!filesOpen)}>{filesOpen ? "Hide the files" : "Files"}</button>
            </div>
            {/* who gets tagged, and the link for first comments */}
            <GuestCard guest={d.episode.guest} handles={d.episode.guest_handles ?? {}} link={d.episode.link ?? null} effective={d.link} busy={!!busy}
              onSave={async (b) => !(await call(`/api/episodes/${id}`, "PATCH", b, "Saving the guest and links…")).error} />
            {sending && (
              <div className="rise" style={{ ...card, padding: 14, marginBottom: 12, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}><b style={{ wordBreak: "break-all" }}>{sending.name}</b><span style={{ color: C.muted, whiteSpace: "nowrap" }}>{mb(sending.done)} of {mb(sending.total)}</span></div>
                <div style={{ height: 8, borderRadius: 4, background: C.line, overflow: "hidden" }}><div style={{ height: "100%", width: `${sending.total ? (sending.done / sending.total) * 100 : 0}%`, background: C.navy, transition: "width .3s" }} /></div>
                <div style={{ fontSize: 12, color: C.muted }}>Keep this tab open until it finishes. If the connection drops, it picks up where it stopped.</div>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              {d.transcribe?.status === "running" ? (
                <div className="rise" style={{ ...card, padding: 14, display: "grid", gap: 6, fontSize: 13, lineHeight: 1.45 }}>
                  <b style={{ fontFamily: HEAD }}>Transcribing{d.transcribe.sources.length > 1 ? ` ${d.transcribe.sources.join(" and ")}, each from their own track` : " the upload"}.</b>
                  <span style={{ color: C.text }}>About 10 minutes for an episode. The moments come up on their own when it&apos;s done.</span>
                  {d.transcribe.log && <span style={{ fontSize: 12, color: C.muted, whiteSpace: "pre-wrap" }}>{d.transcribe.log.trim().split("\n").slice(-2).join("\n")}</span>}
                </div>
              ) : d.transcribe?.found && !d.pieces.length && !(d.episode.moments && Date.parse(d.episode.moments.at) >= Date.parse(d.transcribe.at)) ? (
                <div className="rise" style={{ ...card, padding: 14, fontSize: 13 }}><b style={{ fontFamily: HEAD }}>Transcript ready.</b> Finding the moments now (a minute or two).</div>
              ) : hasTranscript && !d.exact && d.feeds.length > 0 ? (
                <div className="rise" style={{ ...card, padding: 14, display: "grid", gap: 8, fontSize: 13, lineHeight: 1.5 }}>
                  <b style={{ fontFamily: HEAD }}>The transcript&apos;s times are rough.</b>
                  <span style={{ color: C.text }}>A Word or text transcript has a time about once a minute, so a reel cut from it can start in the wrong place, and it can&apos;t always tell who&apos;s talking. Each camera track gives the exact time of every word and who said it. About 10 minutes; the moments move to the right times when it&apos;s done.</span>
                  {d.transcribe?.status === "failed" && Date.now() - new Date(d.transcribe.at).getTime() < 3 * 3600000 && <span style={{ fontSize: 12.5, color: C.warn }}>The last try failed: {d.transcribe.log.trim().split("\n").slice(-1)[0].replace(/https?:\/\/\S+/g, "…")}</span>}
                  <button style={{ ...btn, justifySelf: "start" }} disabled={!!busy} onClick={transcribe}>Transcribe the camera tracks</button>
                </div>
              ) : !hasTranscript && (
                <div style={{ display: "grid", gap: 8 }}>
                  {d.transcribe?.status === "failed" && <p style={{ margin: 0, fontSize: 12.5, color: C.warn, lineHeight: 1.45 }}>The transcription failed: {d.transcribe.log.trim().split("\n").slice(-1)[0].replace(/https?:\/\/\S+/g, "…")}</p>}
                  <p style={{ margin: 0, fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>Add the transcript (.txt, .srt, .vtt or Word), or upload the video or audio and the app transcribes it.</p>
                  {(d.feeds.length > 0 || d.fulls.length > 0 || d.files.some((f) => f.type === "clip" || f.type === "audio")) && <button style={{ ...ghost, justifySelf: "start" }} disabled={!!busy} onClick={transcribe}>{d.transcribe?.status === "failed" ? "Try the transcription again" : "Transcribe it"}</button>}
                </div>
              )}
            </div>
            {filesOpen && (
              <div style={{ marginBottom: 16 }}>
                <div style={card}>
                  {d.feeds.length > 0 && (() => {
                    // The stack job reports how many cameras and voices it found; fewer voices than cameras means a
                    // microphone file is missing (Riverside sometimes puts a person's sound only in their audio track).
                    const m = d.stack?.log.match(/stack: (\d) camera\(s\), (\d) voice/);
                    const short = m && Number(m[2]) < Number(m[1]);
                    return (
                      <div style={{ padding: "12px 16px", borderBottom: "1px solid #eef2f5", display: "grid", gap: 10 }}>
                        <div style={label}>Camera feeds</div>
                        {d.feeds.map((p) => (
                          <div key={p.person} style={{ fontSize: 12.5, display: "grid", gap: 3 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}><b style={{ fontFamily: HEAD }}>{p.person}</b><span style={{ color: C.muted }}>{p.host ? "bottom of the stack" : "top of the stack"}</span></div>
                            {[p.video, p.audio].map((f) => f && (
                              <div key={f.path} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ flex: 1, color: C.text }}>{f.kind === "video" ? "Camera" : "Microphone"} · {mb(f.size)}</span>
                                <button style={{ ...link, color: C.muted, fontSize: 12 }} disabled={!!busy} onClick={() => remove(f.path, f.name)}>Remove</button>
                              </div>
                            ))}
                            {!p.video && <span style={{ color: C.warn }}>No camera file yet.</span>}
                          </div>
                        ))}
                        {short && <div style={{ fontSize: 12.5, color: C.warn, lineHeight: 1.45 }}>Only {m![2]} of {m![1]} voices found. Add the missing person&apos;s microphone file from Riverside, then stack it again.</div>}
                        <div style={{ fontSize: 12.5, color: d.stack?.status === "failed" ? C.warn : C.text, lineHeight: 1.45 }}>
                          {!d.stack ? "Not stacked yet." : d.stack.status === "running" ? "Stacking the whole episode for the trim player. A few minutes." : d.stack.status === "ready" ? "Stacked preview ready." : "Stacking failed."}
                          {d.stack?.status !== "running" && <button style={{ ...link, fontSize: 12, marginLeft: 8 }} disabled={!!busy} onClick={restack}>{d.stack ? "Stack it again" : "Stack it"}</button>}
                        </div>
                      </div>
                    );
                  })()}
                  {d.fulls.length > 0 && (
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #eef2f5" }}>
                      <div style={label}>Full episode</div>
                      {d.fulls.map((f, i) => (
                        <div key={f.path} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 12.5, opacity: i ? 0.55 : 1 }}>
                          <Glyph kind="episode" size={16} />
                          <span style={{ wordBreak: "break-all", flex: 1 }}>{f.name} <span style={{ color: C.muted }}>· {mb(f.size)}{i ? " · older" : ""}</span></span>
                          <button style={{ ...link, color: C.muted, fontSize: 12 }} disabled={!!busy} onClick={() => remove(f.path, f.name)}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {["transcript", "clip", "audio", "image", "other"].map((t) => d.files.filter((f) => f.type === t).length > 0 && (
                    <div key={t} style={{ padding: "12px 16px", borderBottom: "1px solid #eef2f5" }}>
                      <div style={label}>{t === "clip" ? "Video" : t === "audio" ? "Audio" : t === "image" ? "Images" : t === "transcript" ? "Transcript" : "Other"}</div>
                      {d.files.filter((f) => f.type === t).map((f) => (
                        <div key={f.path} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 12.5 }}>
                          {f.url && <img src={f.url} alt="" style={{ width: 30, height: 38, objectFit: "cover", borderRadius: 3 }} />}
                          <span style={{ wordBreak: "break-all", flex: 1 }}>{f.name} <span style={{ color: C.muted }}>· {mb(f.size)}</span></span>
                          <button style={{ ...link, color: C.muted, fontSize: 12 }} disabled={!!busy} onClick={() => remove(f.path, f.name)}>Remove</button>
                        </div>
                      ))}
                    </div>
                  ))}
                  {!d.files.length && <p style={{ padding: 16, margin: 0, fontSize: 13, color: C.muted }}>No material yet.</p>}
                </div>
              </div>
            )}
            {/* what the Moment Coach's last look did, or that it's running (lib/concepts.ts) */}
            <MomentsRun run={d.episode.moments} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
              {TABS.filter(([k]) => k !== "episode" || count((p) => p.kind === "episode")).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} style={{ minHeight: 40, padding: "0 16px", borderRadius: 6, border: `1px solid ${tabKind === k ? C.navy : C.hair}`, background: tabKind === k ? C.navy : "#fff", color: tabKind === k ? "#fff" : C.ink, cursor: "pointer", font: `700 14px ${HEAD}` }}>{l} {count((p) => p.kind === k)}</button>
              ))}
              {gfilter && <span style={{ fontSize: 13, color: C.text, display: "inline-flex", gap: 8, alignItems: "center" }}><i style={{ width: 10, height: 10, borderRadius: 5, background: GROUP[gfilter].color }} />{GROUP[gfilter].label} only <button style={{ ...link, fontSize: 13 }} onClick={() => setGfilter("")}>Show all</button></span>}
              <button onClick={() => setAdd(add ? null : { kind: tabKind === "episode" ? "reel" : tabKind, title: "", source_time: "" })} style={{ ...link, marginLeft: "auto" }}>{add ? "Cancel" : "+ Add a piece"}</button>
            </div>
            {/* the awareness stages (lib/stages.ts): a quiet filter, with the count of this type of content at each stage */}
            {d.pieces.some((p) => p.awareness) && (() => {
              const here = d.pieces.filter((p) => p.kind === tabKind && (!gfilter || groupOf(p.status) === gfilter) && p.status !== "skipped");
              const opt = (v: Awareness | "" | "none", l: string, n: number) => (
                <button key={v || "all"} onClick={() => setStage(v)} aria-pressed={stage === v} style={{ ...link, fontSize: 13, color: stage === v ? C.ink : C.muted, textDecoration: stage === v ? "underline" : "none" }}>{l} {n}</button>
              );
              return (
                <div style={{ display: "flex", gap: "6px 16px", flexWrap: "wrap", alignItems: "center", margin: "-4px 0 14px" }}>
                  <span style={label}>Stage</span>
                  {opt("", "All", here.length)}
                  {AWARENESS.map((a) => opt(a, STAGE_LABEL[a], here.filter((p) => p.awareness === a).length))}
                  {/* pieces added by hand, or made before the levels existed, so the counts always add up to All */}
                  {here.some((p) => !p.awareness) && opt("none", "No stage", here.filter((p) => !p.awareness).length)}
                </div>
              );
            })()}
            {add && (
              <div className="rise" style={{ ...card, padding: 12, marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value })} style={{ ...input, width: "auto" }}>
                  <option value="reel">Reel</option><option value="carousel">Carousel</option><option value="post">LinkedIn post</option>
                </select>
                <select aria-label="Awareness stage" value={add.awareness ?? ""} onChange={(e) => setAdd({ ...add, awareness: e.target.value })} style={{ ...input, width: "auto" }}>
                  <option value="">Stage</option>{AWARENESS.map((a) => <option key={a} value={a}>{STAGE_LABEL[a]}</option>)}
                </select>
                <input placeholder="Title, e.g. the Riverside Magic Clip name" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} style={{ ...input, flex: "1 1 220px", width: "auto" }} />
                <input placeholder="Starts at (mm:ss)" value={add.source_time} onChange={(e) => setAdd({ ...add, source_time: e.target.value })} style={{ ...input, width: 140 }} />
                <button style={btn} disabled={!add.title.trim() || !!busy} onClick={async () => { const r = await call(`/api/episodes/${id}`, "POST", add); if (r.piece) { setAdd(null); setFilter(r.piece.kind); openPiece(r.piece.id); } }}>Add</button>
              </div>
            )}
            {!d.pieces.length && <div style={{ ...card, padding: 28, color: C.muted }}>{idea ? "No pieces yet. Find the moments in the idea above." : <>Add the episode&apos;s files. The ideas show up here once the transcript is in.</>}</div>}
            {d.pieces.length > 0 && !live.length && !killed.length && <div style={{ ...card, padding: 24, color: C.muted }}>Nothing here{gfilter ? ` in ${GROUP[gfilter].label.toLowerCase()}` : ""}{stage === "none" ? " with no stage" : stage ? ` for ${STAGE_LABEL[stage].toLowerCase()} readers` : ""}.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16 }}>{live.map(cardOf)}</div>
            {killed.length > 0 && (
              <div style={{ marginTop: 18 }}>
                {gfilter !== "killed" && <button style={{ ...link, color: C.muted }} onClick={() => setShowKilled(!showKilled)}>Killed {killed.length} · {showKilled ? "Hide" : "Show"}</button>}
                {(showKilled || gfilter === "killed") && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 16, marginTop: 12 }}>{killed.map(cardOf)}</div>}
              </div>
            )}
          </>
        )}

        {/* The piece, as its own page */}
        {sel && (
          <article style={{ ...card, maxWidth: 860, margin: "0 auto", padding: "20px 26px 0", display: "flex", flexDirection: "column", gap: 16 }}>
            <button style={{ ...link, alignSelf: "start", fontSize: 13.5 }} onClick={() => openPiece(null)}>← Back to the {(TABS.find(([k]) => k === sel.kind)?.[1] ?? "pieces").toLowerCase()}</button>
            {sel && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", ...label }}><Glyph kind={sel.kind} /> #{sel.num} · {kindName(sel, selAnim)}{sel.source_time && !idea ? ` · ${sel.source_time}` : ""}</span>
                  <span style={chip(STATUS[sel.status] ?? STATUS.draft)}>{STATUS[sel.status]?.label}</span>
                </div>
                <h2 style={{ margin: 0, font: `800 21px/1.2 ${HEAD}` }}>{sel.title}</h2>
                {/* an unreviewed piece: keep or kill it right here, without scrolling to the bar at the bottom */}
                {sel.status === "concept" && next?.go && (
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginTop: -4 }}>
                    <button style={{ ...btn, minHeight: 44, padding: "0 22px" }} disabled={!!busy} onClick={next.go}>{busy ? "Working…" : next.label}</button>
                    {next.alt && <button style={{ ...link, fontSize: 13.5 }} disabled={!!busy} onClick={next.alt.go}>{next.alt.label}</button>}
                    <button style={{ ...link, fontSize: 13.5, color: C.muted }} disabled={!!busy} onClick={() => patch(sel.id, { status: "skipped" })}>Kill it</button>
                  </div>
                )}
                {/* who it's for, and the insight it shares with its other angles (lib/stages.ts) */}
                {/* the stage the piece is built for, which the team can set or change (a piece added by hand has none) */}
                {sel.kind !== "episode" && (
                  <label style={{ ...stageText, display: "inline-flex", gap: 8, alignItems: "center", marginTop: -8 }}>Stage
                    <select value={sel.awareness ?? ""} disabled={!!busy} onChange={(e) => patch(sel.id, { awareness: e.target.value || null })} style={{ ...input, width: "auto", minHeight: 32, fontSize: 13 }}>
                      <option value="">No stage</option>{AWARENESS.map((a) => <option key={a} value={a}>{STAGE_LABEL[a]}</option>)}
                    </select>
                  </label>
                )}
                {(stageLine(sel) || sel.insight) && (() => {
                  const others = sel.insight ? d.pieces.filter((o) => o.id !== sel.id && o.insight === sel.insight && o.status !== "skipped") : [];
                  return (
                    <div style={{ display: "grid", gap: 4, marginTop: -8 }}>
                      {stageLine(sel) && <span style={stageText}>{stageLine(sel)}</span>}
                      {sel.insight && (
                        <span style={{ fontSize: 13, color: C.text, lineHeight: 1.5, display: "flex", gap: "2px 12px", flexWrap: "wrap", alignItems: "baseline" }}>
                          <span><b style={{ color: C.ink }}>Insight:</b> {sel.insight}</span>
                          {others.length > 0 && <span style={{ color: C.muted }}>Other angles:</span>}
                          {others.map((o) => <button key={o.id} style={{ ...link, fontSize: 13 }} onClick={() => { setFilter(o.kind); openPiece(o.id); }}>#{o.num} {kindName(o, anim(o))}{o.awareness ? `, ${STAGE_LABEL[o.awareness as Awareness]?.toLowerCase() ?? o.awareness}` : ""}</button>)}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {sel.hook && <div style={{ fontSize: 14, lineHeight: 1.5 }}><b>Hook:</b> {sel.hook}</div>}
                {/* the Moment Coach's case: open while it's an idea, folded once it's made and the coach reviews the piece */}
                {sel.moment ? (!made ? <MomentCard m={sel.moment} /> : (
                  <details><summary style={{ ...link, display: "inline", fontSize: 13 }}>Why this moment ({sel.moment.score}/100)</summary><div style={{ marginTop: 10 }}><MomentCard m={sel.moment} /></div></details>
                )) : sel.why && !made && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{sel.why}</div>}
                {["approved", "scheduled"].includes(sel.status) && <div style={{ background: C.navy, color: "#fff", borderRadius: 6, padding: "12px 14px", font: `700 14px/1.4 ${HEAD}` }}>{OWNER} approved this{sel.scheduled_at ? ` for ${slotStamp(sel.scheduled_at)}` : ""}.</div>}
                {sel.status === "changes" && !fresh(sel) && (() => {
                  // the owner's note on top, where it can't be missed (the activity below is folded)
                  const back = [...notes].reverse().find((n) => n.kind === "sendback");
                  return (
                    <div style={{ border: `1.5px solid ${C.navy}`, borderRadius: 6, padding: "12px 14px", display: "grid", gap: 6 }}>
                      <b style={{ font: `700 14px/1.4 ${HEAD}` }}>{OWNER} sent this back.</b>
                      {back && <span style={{ fontSize: 15, lineHeight: 1.5 }}>&ldquo;{back.body}&rdquo;</span>}
                      {sel.kind === "reel" && back
                        ? <button style={{ ...btn, justifySelf: "start", marginTop: 4 }} disabled={!!busy} onClick={() => openChanges("own", back.body)}>Make {OWNER}&apos;s changes</button>
                        : <span style={{ fontSize: 12.5, color: C.muted }}>Fix it, then ask {COACH} again.</span>}
                    </div>
                  );
                })()}
                {sel.status === "skipped" && (notes.some((n) => n.kind === "drop") || wasMade(sel)) && (
                  <div style={{ background: C.soft, borderRadius: 6, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", font: `600 14px/1.4 ${HEAD}` }}>
                    <span style={{ flex: 1 }}>This piece is off the board. No more work on it.</span>
                    <button style={ghost} disabled={!!busy} onClick={() => decide(sel.id, "restore")}>Bring it back</button>
                  </div>
                )}
                {fresh(sel) && sel.status !== "skipped" && (
                  <div className="rise" style={{ borderRadius: 6, border: `1.5px solid ${C.navy}`, overflow: "hidden", flexShrink: 0 }}>
                    <div style={{ background: C.navy, color: "#fff", padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", font: `700 13px ${HEAD}` }}><Glyph kind="coach" light size={18} /> {OWNER} answered {COACH}</div>
                    <div style={{ padding: "12px 14px", display: "grid", gap: 10 }}>
                      {sel.review?.question && <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>{sel.review.question}</div>}
                      <div style={{ fontSize: 15, lineHeight: 1.5 }}>&ldquo;{sel.answer!.body}&rdquo;</div>
                      {sel.kind === "post" && sel.body
                        ? <button style={{ ...btn, justifySelf: "start" }} disabled={!!busy} onClick={() => fix(sel.id, `Work ${OWNER}'s answer in as their take, in their own words.`)}>Rewrite with {OWNER}&apos;s answer</button>
                        : sel.kind === "reel" ? <button style={{ ...btn, justifySelf: "start" }} disabled={!!busy} onClick={() => openChanges("own", `Work in ${OWNER}'s answer as their take, in their own words: "${sel.answer!.body}"`)}>Work it in</button>
                        : <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.5 }}>Put {OWNER}&apos;s words in the {OWNER}&apos;s take slide, then ask {COACH} again.</p>}
                    </div>
                  </div>
                )}

                {made && sel.kind !== "episode" && <CoachCard review={sel.review} team answer={sel.answer && sel.review && new Date(sel.answer.at) > new Date(sel.review.at) ? sel.answer.body : null} busy={reviewing === sel.id || autoReview(sel)} onAsk={() => ask(sel.id)} onHook={sel.kind === "post" ? useHook : undefined} hideFixes={sel.kind === "reel"} />}
                <Preview p={sel} width={400} />
                {sel.kind === "reel" && sel.status === "making" && sel.media?.video && (
                  <div className="rise" style={{ borderRadius: 6, background: C.soft, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.5 }}>
                    <b style={{ fontFamily: HEAD }}>Making your changes.</b> {sel.media.changing?.reply || told} This version stays here until the new one lands, in about 10 minutes. Then {COACH} looks at it again.
                  </div>
                )}
                {sel.kind === "reel" && made && sel.media?.video && sel.media.render_error && (
                  <div style={{ borderRadius: 6, border: `1.5px solid ${C.warn}`, padding: "10px 14px", fontSize: 13.5, lineHeight: 1.5 }}>
                    <b style={{ fontFamily: HEAD }}>The last change didn&apos;t go through.</b> This is still the version before it. {sel.media.render_status?.split("\n").filter(Boolean).slice(-2).join(" ")}
                  </div>
                )}
                {sel.kind === "reel" && made && sel.media?.video && (
                  <div ref={chgRef} style={{ scrollMarginTop: 80, display: "grid", gap: 10 }}>
                    <ReelChanges review={sel.review} open={chg} onOpen={setChg} draft={own} setDraft={setOwn} busy={!!busy || reviewing === sel.id || autoReview(sel)} approved={["approved", "scheduled"].includes(sel.status)} onSubmit={(c) => changeReel(sel, c)} />
                    {told && !busy && <div className="rise" style={{ fontSize: 13.5, lineHeight: 1.5, color: C.text }}>{told}</div>}
                  </div>
                )}

                {sel.kind === "post" && sel.body && <ImagePick p={sel} onSave={(image) => patch(sel.id, { image })} />}
                {sel.kind === "post" && sel.body && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Tell the writer what to change" style={{ ...input, flex: 1, width: "auto" }} />
                      <button style={ghost} disabled={!instr.trim() || !!busy} onClick={() => fix(sel.id, instr)}>Rewrite with this note</button>
                    </div>
                    <button style={{ ...link, justifySelf: "start" }} onClick={() => setEdit(!edit)}>{edit ? "Close the editor" : "Edit text"}</button>
                    {edit && <>
                      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} style={area} />
                      <button style={{ ...btn, justifySelf: "start" }} onClick={() => patch(sel.id, { body: text })}>Save edits</button>
                    </>}
                  </div>
                )}
                {made && sel.kind === "carousel" && !canMake && <button style={{ ...link, alignSelf: "start" }} onClick={() => setRemake(true)}>Rebuild the carousel</button>}

                {sel.kind === "post" && !sel.body && drafting(sel) && <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>The writer is drafting this post with the LinkedIn skill, then {COACH} gives it a first look. It shows here in a few minutes.</div>}
                {canMake && sel.kind === "post" && !sel.body && !drafting(sel) && <button style={btn} disabled={!!busy} onClick={() => make(sel.id, {}, "Writing the post with the LinkedIn skill (about a minute)…")}>Write the post</button>}
                {selAnim && !made && (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ borderRadius: 6, background: C.soft, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.5 }}>
                      <b style={{ fontFamily: HEAD }}>An animated reel, with no camera footage.</b> The animated reel editor makes it from {idea ? "the idea" : "the words"}: animated type and brand graphics, timed to your voiceover. There&apos;s nothing to cut or trim here.
                    </div>
                    <VoiceOver key={sel.id} pieceId={sel.id} busy={!!busy} />
                    {canMake && (
                      <>
                        <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                          <span>Notes for the editor <span style={{ fontWeight: 400, color: C.muted }}>optional</span></span>
                          <textarea value={enotes} onChange={(e) => setEnotes(e.target.value)} rows={enotes ? 5 : 2} placeholder="Small changes for this reel, e.g. open on the 15,000 as a number, a list for the three steps, end on the line about effort" style={{ ...area, minHeight: 0, fontWeight: 400 }} />
                        </label>
                        <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                          <button style={btn} disabled={!!busy} onClick={() => make(sel.id, { notes: enotes }, "Starting the animated reel editor…")}>Make the reel</button>
                          <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>{ANIM_NOTE}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
                {sel.kind === "reel" && !selAnim && (() => {
                  // A reel goes moment, clip, reel. The stacked camera feeds (or a 9:16 full episode) make every moment
                  // cuttable; without them, the moment still shows what's said, and the upload sits right here.
                  const { a, b, full, src, srcKey, stacking, hasClip, showClip, pick, same, ready, how } = reel!;
                  // made: what's said in and around the clip, for writing a change ("let me finish the thought")
                  if (!canMake) return d.lines.length > 0 && (
                    <details>
                      <summary style={{ ...link, display: "inline", fontSize: 13 }}>What&apos;s said in this part of the episode ({clock(a)} to {clock(b)})</summary>
                      <div style={{ marginTop: 10 }}><Lines lines={d.lines} start={a} end={b} height={220} /></div>
                    </details>
                  );
                  return (
                    <div style={{ display: "grid", gap: 18 }}>
                      <div style={{ display: "grid", gap: 10 }}>
                        <Step n={1} title={showClip ? "The clip" : src ? "Pick the part to use" : "The moment"} note={showClip ? `${clock(sel.media!.cut?.start ?? a)} to ${clock(sel.media!.cut?.end ?? b)}` : `${clock(a)} to ${clock(b)} · ${(b - a).toFixed(0)} s`} />
                        {showClip ? (
                          <>
                            <ClipReview src={sel.clip_url!} start={sel.media!.cut?.start ?? a} end={sel.media!.cut?.end ?? b} lines={sel.media!.cut ? d.lines : []} />
                            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                              {src && <button style={link} onClick={() => setTrimOpen(true)}>Change the start or end</button>}
                              <a href={`${sel.clip_url}&download=`} style={{ ...link, color: C.muted }}>Download the clip</a>
                            </div>
                          </>
                        ) : src ? (
                          <>
                            {!sel.source_end && !sel.media?.cut && <p style={{ margin: 0, fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>The start comes from the transcript and the end is a first guess. Watch it, then move either end with &ldquo;Start here&rdquo; and &ldquo;End here&rdquo; in what&apos;s said.</p>}
                            <Trim key={`${sel.id}-${srcKey}`} src={src} start0={a} end0={b} lines={d.lines} rough={d.rough} busy={!!busy} offset={reel.offset} wideOk={reel.cams} onChange={(s, e, problem) => setRange({ id: sel.id, s, e, problem })} />
                            {hasClip && <button style={{ ...link, justifySelf: "start" }} onClick={() => setTrimOpen(false)}>Keep the clip I have</button>}
                          </>
                        ) : (
                          <>
                            {d.lines.length > 0 && <Lines lines={d.lines} start={a} end={b} height={220} />}
                            {stacking ? (
                              <div style={{ padding: 14, borderRadius: 6, background: C.soft, fontSize: 13, lineHeight: 1.5 }}>
                                <b style={{ fontFamily: HEAD }}>{d.stack?.status === "failed" ? "Stacking failed." : "Stacking the episode."}</b> {d.stack?.status === "failed" ? "Try “Stack it again” under Camera feeds." : "The cut tools open here when the stacked preview is ready, in a few minutes."}
                              </div>
                            ) : (
                            <div style={{ display: "grid", gap: 10, padding: 16, borderRadius: 6, border: `1.5px dashed ${C.navy}`, background: "#fbfcfd" }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", font: `800 15px ${HEAD}` }}><Glyph kind="episode" size={18} /> Cut this moment straight from the episode</div>
                              <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.5 }}>Add the camera feeds from Riverside&apos;s separate tracks (each person&apos;s camera and microphone, plus the .srt). The app stacks them into 9:16, and every reel idea here opens on its moment, ready to trim and cut.</p>
                              {sending ? (
                                <div style={{ display: "grid", gap: 6 }}>
                                  <div style={{ fontSize: 12.5, color: C.muted }}>Uploading {mb(sending.done)} of {mb(sending.total)}. Keep this tab open.</div>
                                  <div style={{ height: 8, borderRadius: 4, background: C.line, overflow: "hidden" }}><div style={{ height: "100%", width: `${sending.total ? (sending.done / sending.total) * 100 : 0}%`, background: C.navy, transition: "width .3s" }} /></div>
                                </div>
                              ) : <label htmlFor="feeds" style={{ ...btn, justifySelf: "start" }}>Add the camera feeds</label>}
                            </div>
                            )}
                          </>
                        )}
                      </div>

                      <div style={{ display: "grid", gap: 10 }}>
                        <Step n={2} title="Make the reel" note={`About 10 minutes, then ${COACH} reviews it`} />
                          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                            <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>Notes for the editor <span style={{ fontWeight: 400, color: C.muted }}>optional</span>
                              {sel.review && sel.review.verdict !== "ready" && <button type="button" style={{ ...link, marginLeft: "auto", fontSize: 12 }} onClick={() => setEnotes(fixNotes(sel))}>Use {COACH}&apos;s fixes</button>}
                            </span>
                            <textarea value={enotes} onChange={(e) => setEnotes(e.target.value)} rows={enotes ? 5 : 2} placeholder="Small changes for this reel, e.g. show the email as a phone message at 0:12, a number box for the $10,000, more of the guest in the middle" style={{ ...area, minHeight: 0, fontWeight: 400 }} />
                          </label>
                        <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                          <button style={btn} disabled={!!busy || !ready} onClick={() => makeReel(sel.id, full?.path ?? "", same ? null : pick, same ? sel.media!.clip! : null, enotes)}>{made ? "Make it again" : "Make the reel"}</button>
                          <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>{how}</span>
                        </div>
                        <details open={!hasClip && !src && !stacking}>
                          <summary style={{ ...link, display: "inline", fontSize: 13 }}>Use an uploaded clip instead</summary>
                          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                            <select value={clip} onChange={(e) => setClip(e.target.value)} style={input}>
                              <option value="">Pick a clip</option>
                              {clips.map((c) => <option key={c.path} value={c.path}>{c.name}</option>)}
                            </select>
                            <button style={{ ...ghost, justifySelf: "start" }} disabled={!clip || !!busy} onClick={() => make(sel.id, { clip, notes: enotes }, "Starting the cloud editor…")}>Make the reel from this clip</button>
                            {d.renders.length > 0 && (
                              <label style={{ fontSize: 13, fontWeight: 600 }}>Or use a finished render
                                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                                  <select value={render} onChange={(e) => setRender(e.target.value)} style={{ ...input, flex: 1, width: "auto" }}>
                                    <option value="">Pick a render</option>
                                    {d.renders.map((r) => <option key={r} value={r}>{r.replace("renders/", "")}</option>)}
                                  </select>
                                  <button style={ghost} disabled={!render || !!busy} onClick={() => make(sel.id, { render }, "Attaching the render…")}>Use it</button>
                                </div>
                              </label>
                            )}
                          </div>
                        </details>
                      </div>
                    </div>
                  );
                })()}
                {canMake && sel.kind === "carousel" && (
                  <div style={{ display: "grid", gap: 18 }}>
                    <div style={{ display: "grid", gap: 10 }}>
                      <Step n={1} title="The slide plan" note={sel.outline ? `${planLines(sel.outline).length} slides` : undefined} />
                      {editPlan ? (
                        <>
                          <textarea value={planText} onChange={(e) => setPlanText(e.target.value)} rows={9} style={area} />
                          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                            <button style={ghost} disabled={!planText.trim() || !!busy} onClick={async () => { await patch(sel.id, { outline: planText.trim() }); setEditPlan(false); }}>Save the plan</button>
                            <button style={link} onClick={() => setEditPlan(false)}>Cancel</button>
                          </div>
                        </>
                      ) : sel.outline ? (
                        <>
                          <ol style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 7, fontSize: 13.5, lineHeight: 1.45, color: C.ink }}>
                            {planLines(sel.outline).map((l, i) => <li key={i}>{fullPlan || l.length <= 110 ? l : `${l.slice(0, 105).trimEnd()}…`}</li>)}
                          </ol>
                          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                            {planLines(sel.outline).some((l) => l.length > 110) && <button style={link} onClick={() => setFullPlan(!fullPlan)}>{fullPlan ? "Show less" : "Show full plan"}</button>}
                            <button style={link} onClick={() => { setPlanText(sel.outline ?? ""); setEditPlan(true); }}>Edit plan</button>
                            <button style={{ ...link, color: C.muted }} disabled={!!busy} onClick={() => writePlan(sel.id)}>Start over</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>No slide plan yet. The planner reads the episode around {sel.source_time} and lays out each slide, so you can see the deck before it&apos;s built.</p>
                          <button style={{ ...ghost, justifySelf: "start" }} disabled={!!busy} onClick={() => writePlan(sel.id)}>Write the slide plan</button>
                        </>
                      )}
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      <Step n={2} title="Build the carousel" note={`About 6 minutes, then ${COACH} reviews it`} />
                      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                        <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>Notes for the designer <span style={{ fontWeight: 400, color: C.muted }}>optional</span>
                          {sel.review && sel.review.verdict !== "ready" && <button type="button" style={{ ...link, marginLeft: "auto", fontSize: 12 }} onClick={() => setEnotes(fixNotes(sel))}>Use {COACH}&apos;s fixes</button>}
                        </span>
                        <textarea value={enotes} onChange={(e) => setEnotes(e.target.value)} rows={enotes ? 5 : 2} placeholder={`Small changes, e.g. show the email as a phone message, use the guest's line at 18:40 over their frame, a photo of ${OWNER} on ${OWNER}'s take`} style={{ ...area, minHeight: 0, fontWeight: 400 }} />
                      </label>
                      <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                        <button style={btn} disabled={!!busy} onClick={() => make(sel.id, { notes: enotes }, "Starting the carousel builder…")}>{made ? "Build it again" : "Build the carousel"}</button>
                        <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>{sel.outline ? "The builder follows the plan above" : "With no plan, the builder plans it itself"}, pulls stills from the camera feeds and writes each slide in the brand&apos;s carousel kit.</span>
                      </div>
                      <details>
                        <summary style={{ ...link, display: "inline", fontSize: 13 }}>Or use slide images you uploaded</summary>
                        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                    {!images.length && <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Upload the slide images on the left.</p>}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                      {images.map((im) => (
                        <label key={im.path} style={{ fontSize: 11, cursor: "pointer" }}>
                          <img src={im.url ?? ""} alt="" style={{ width: "100%", borderRadius: 3, outline: slides.includes(im.path) ? `3px solid ${C.navy}` : "none" }} />
                          <input type="checkbox" checked={slides.includes(im.path)} onChange={(e) => setSlides(e.target.checked ? [...slides, im.path] : slides.filter((s) => s !== im.path))} /> {slides.includes(im.path) ? `${slides.indexOf(im.path) + 1}. ` : ""}{im.name.slice(0, 16)}
                        </label>
                      ))}
                    </div>
                    <button style={{ ...ghost, justifySelf: "start" }} disabled={!slides.length || !!busy} onClick={() => make(sel.id, { slides }, "Putting the carousel together…")}>Use these images</button>
                        </div>
                      </details>
                    </div>
                  </div>
                )}

                {/* from the idea on: every piece comes with its caption */}
                {(sel.kind === "reel" || sel.kind === "carousel") && sel.status !== "skipped" && (
                  <Caption key={sel.id} kind={sel.kind} channels={chans} onChannels={(c) => { setChans(c); patch(sel.id, { channels: c }); }} captions={sel.captions ?? {}} fallback={sel.caption ?? ""} leadMagnetId={sel.lead_magnet_id ?? null} busy={!!busy} writing={drafting(sel)} guest={guest}
                    onSave={(own, shared) => patch(sel.id, { captions: own, caption: shared, channels: chans })}
                    onLeadMagnet={(lm) => patch(sel.id, { lead_magnet_id: lm })}
                    onWrite={async () => { if (JSON.stringify(chans) !== JSON.stringify(sel.channels ?? [])) await patch(sel.id, { channels: chans }); await call(`/api/pieces/${sel.id}/caption`, "POST", {}, `Writing the caption from what's said in the moment, then ${COACH}'s first look (about two minutes)…`); }} />
                )}

                {["draft", "changes"].includes(sel.status) && sel.review && sel.review.verdict !== "ready" && (
                  <details style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
                    <summary style={{ ...link, display: "inline", fontSize: 13 }}>Send it to {OWNER} without a pass</summary>
                    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                      <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.5 }}>Say why. {OWNER} sees your note next to {COACH}&apos;s review.</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={`Why it should go to ${OWNER} now`} style={{ ...input, flex: 1, width: "auto" }} />
                        <button style={ghost} disabled={!why.trim() || !!busy} onClick={() => decide(sel.id, "send", { note: why })}>Send anyway</button>
                      </div>
                    </div>
                  </details>
                )}

                {made && sel.kind !== "episode" && (
                  <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "grid", gap: 10 }}>
                    <div style={label}>The date</div>
                    {/* saves itself when you leave the field */}
                    <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} onBlur={() => { const iso = when ? fromSlotInput(when) : null; if (iso && (!sel.scheduled_at || iso !== new Date(sel.scheduled_at).toISOString())) patch(sel.id, { scheduled_at: iso, channels: chans }); }} style={input} />
                    {sel.scheduled_at && <button style={{ ...link, justifySelf: "start" }} onClick={() => { setWhen(""); patch(sel.id, { scheduled_at: null }); }}>Clear the date</button>}
                    <p style={{ margin: 0, fontSize: 12, color: C.muted }}>A date is a plan. It goes out only after {OWNER} approves it.</p>
                  </div>
                )}
                {sel.kind === "episode" && <FullEdit key={d.full_edit?.at ?? "none"} feeds={d.feeds} edit={d.full_edit} latest={d.fulls[0] ?? null} busy={!!busy}
                  onStart={(start, end, notes) => call(`/api/episodes/${id}/edit`, "POST", { start, end, notes }, "Starting the produced episode on a cloud machine…")} />}
                {sel.kind === "episode" && <Thumbnail key={d.episode.id} episodeId={d.episode.id} isOwner={isOwner()} />}
                {sel.kind === "episode" && <PodcastPublish episodeId={d.episode.id} />}
                {(made || sel.kind === "episode") && (
                  <SendCs p={sel} isOwner={isOwner()} busy={!!busy} guest={guest} link={d.link} onCollab={(on) => patch(sel.id, { collab: on })}
                    onSend={async (mode) => { if (mode === "scheduled" && !window.confirm(`Schedule this in ${SCHEDULER_NAME}? It goes out on the date you set.`)) return; await call(`/api/pieces/${sel.id}/send`, "POST", { mode }, mode === "draft" ? `Sending one draft per network to ${SCHEDULER_NAME}…` : `Scheduling it in ${SCHEDULER_NAME}…`); loadNotes(sel.id); }}
                    onRefresh={() => call(`/api/pieces/${sel.id}/send`, "GET", undefined, `Checking ${SCHEDULER_NAME}…`)}
                    onHandoff={(undo) => call(`/api/pieces/${sel.id}/handoff`, "POST", { undo }, undo ? "Taking it back…" : "Marking it scheduled…")} />
                )}

                {sel.kind !== "episode" && (
                  <details style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "grid", gap: 10 }}>
                    <summary style={{ ...label, cursor: "pointer" }}>Activity ({notes.length})</summary>
                    {notes.map((n) => (
                      <div key={n.id} style={{ fontSize: 13, lineHeight: 1.5, padding: "8px 10px", borderRadius: 6, background: n.author === OWNER || n.author === OWNER_FULL ? "#eef7fd" : n.author === COACH ? C.soft : "#fff", border: `1px solid ${C.line}` }}>
                        <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 2 }}><b style={{ color: C.ink }}>{n.author}</b> {NOTE_KIND[n.kind] ?? ""} · {new Date(n.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                        {n.body}
                      </div>
                    ))}
                    {!notes.length && <p style={{ margin: 0, fontSize: 13, color: C.muted }}>No notes yet.</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={`Add a note for the team or ${OWNER}`} style={{ ...input, flex: 1, width: "auto" }} />
                      <button style={ghost} disabled={!noteText.trim()} onClick={() => addNote(sel.id)}>Add</button>
                    </div>
                  </details>
                )}
              </>
            )}
            {/* the one button that moves it forward, always in reach */}
            {sel && next ? (
              <div style={{ position: "sticky", bottom: 0, margin: "4px -26px 0", padding: "12px 26px", background: "#fff", borderTop: `1px solid ${C.line}`, borderRadius: "0 0 6px 6px", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", boxShadow: "0 -10px 24px rgba(11,27,39,0.07)", zIndex: 5 }}>
                <span style={{ flex: "1 1 260px", fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>{busy || next.note}</span>
                {next.alt && <button style={{ ...link, fontSize: 13 }} onClick={next.alt.go}>{next.alt.label}</button>}
                {next.go ? <button style={{ ...btn, minHeight: 48, padding: "0 24px" }} disabled={!!busy} onClick={next.go}>{busy ? "Working…" : next.label}</button> : <b style={{ font: `700 15px ${HEAD}` }}>{next.label}</b>}
              </div>
            ) : <div style={{ height: 8 }} />}
          </article>
        )}
      </main>
    </>
  );
}
