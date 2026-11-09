"use client";
import { useEffect, useMemo, useState } from "react";
import PieceSheet from "./components/PieceSheet";
import Glyph from "./components/Glyph";
import { C, HEAD, STATUS, GROUP, groupOf, btn, link, card, label, chip, changed, isOwner as ownerSignedIn } from "../lib/ui";
import { slotStamp } from "../lib/cadence";
import { OWNER, COACH, TZ_LABEL, SLOTS, SCHEDULER_ID, SCHEDULER_NAME } from "../lib/brand";
import type { ViewPiece } from "../lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// The posting rhythm in words, from the brand settings: "9:00 AM, 12:00 PM and 5:00 PM", the episode's day and hour.
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const COUNT = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const hourText = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const RHYTHM = `up to ${COUNT[SLOTS.hours.length] ?? SLOTS.hours.length} a day (${andList(SLOTS.hours.map(hourText))} ${TZ_LABEL})`;
const EPISODE_SLOT = `on ${DAY_NAMES[SLOTS.episodeDay]} at ${hourText(SLOTS.episodeHour)}`;
// "scheduled" in the app means the owner approved it and it has a date; it only says Scheduled once the scheduler has it
const stateLabel = (p: ViewPiece) => (p.status === "scheduled" && !(p.media?.cs?.mode === "scheduled" && p.media.cs.results.some((r) => r.ok)) && !p.media?.handoff ? "Approved" : STATUS[p.status]?.label);
const weekOf = (d: Date) => { const s = new Date(d); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - s.getDay()); return s; };
const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const APPROVED = ["approved", "scheduled", "posted"];

function Stat({ n, text, blue, href }: { n: number; text: string; blue?: boolean; href?: string }) {
  return (
    <a href={href} style={{ textDecoration: "none", color: "#fff", padding: "2px 22px", borderLeft: "1px solid rgba(255,255,255,.14)", minWidth: 118 }}>
      <div className={blue && n > 0 ? "flip" : undefined} style={{ font: `800 46px/1 ${HEAD}`, letterSpacing: "-0.04em", color: blue && n > 0 ? C.accent : "#fff" }}>{n}</div>
      <div style={{ fontSize: 12, color: C.onNavy, marginTop: 6 }}>{text}</div>
    </a>
  );
}

function Tile({ p, selected, onOpen }: { p: ViewPiece; selected: boolean; onOpen: () => void }) {
  const ready = p.status === "ready";
  // the same group colours as the episode pages: green scheduled, amber in edit, dashed slate unreviewed; the accent = the owner's turn
  const gc = GROUP[groupOf(p.status)].color, dashed = groupOf(p.status) === "unreviewed";
  const thumb = p.kind === "carousel" ? p.slide_urls?.[0] : null;
  const time = p.scheduled_at ? slotStamp(p.scheduled_at, { hour: "numeric", minute: "2-digit" }) : "";
  return (
    <button draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; }} onClick={onOpen} className="tile"
      style={{ display: "flex", gap: 7, width: "100%", textAlign: "left", marginBottom: 6, padding: "7px 8px", borderRadius: 6, cursor: "grab", background: ready ? C.accent : "#fff", color: ready ? C.accentInk : C.ink, border: selected ? `2px solid ${C.navy}` : ready ? `1.5px solid ${C.accent}` : `1.5px ${dashed ? "dashed" : "solid"} ${gc}`, font: "12px/1.3 Poppins, Arial, sans-serif" }}>
      {thumb ? <img src={thumb} alt="" style={{ width: 30, height: 38, objectFit: "cover", borderRadius: 3, flex: "none" }} />
        : p.kind === "reel" && p.video_url ? <video src={`${p.video_url}#t=1`} muted playsInline preload="metadata" style={{ width: 30, height: 38, objectFit: "cover", borderRadius: 3, flex: "none", background: "#000", pointerEvents: "none" }} />
        : <Glyph kind={p.kind} size={18} />}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", font: `700 11px ${HEAD}`, opacity: 0.8 }}>#{p.num} · {time}</span>
        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontWeight: 600 }}>{p.title}</span>
        <span style={{ display: "block", marginTop: 3, font: `700 10.5px ${HEAD}`, color: ready ? C.accentInk : groupOf(p.status) === "scheduled" ? gc : C.muted }}>{stateLabel(p)}</span>
      </span>
    </button>
  );
}

export default function Calendar() {
  const [pieces, setPieces] = useState<ViewPiece[]>([]);
  const [waiting, setWaiting] = useState<ViewPiece[]>([]);
  const [pipeline, setPipeline] = useState<Record<string, number>>({});
  // A rolling five weeks from the current week, so what's going out soon is always on the first screen.
  const [start, setStart] = useState(() => weekOf(new Date()));
  const [sel, setSel] = useState<ViewPiece | null>(null);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [over, setOver] = useState("");
  const [asks, setAsks] = useState(0);
  const [undated, setUndated] = useState(0);
  const [filling, setFilling] = useState(false);
  // The owner sees what's waiting on them; the team sees what's next for them (the accent is for the owner).
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => { const read = () => setIsOwner(ownerSignedIn()); read(); window.addEventListener("studio:changed", read); return () => window.removeEventListener("studio:changed", read); }, []);

  async function load() {
    fetch("/api/queue?count=1").then((x) => x.json()).then((r) => setAsks(r.questions ?? 0)).catch(() => {});
    const r = await fetch("/api/calendar").then((x) => x.json()).catch(() => ({ error: "Network error" }));
    setLoaded(true);
    if (r.error) return setErr(r.error);
    setPieces(r.pieces); setWaiting(r.waiting); setPipeline(r.pipeline); setUndated(r.undated ?? 0);
  }
  // pieces kept before the posting rhythm existed: each takes the next open day for its kind
  async function fill() {
    setFilling(true); setErr("");
    const r = await fetch("/api/calendar/slots", { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
    setFilling(false);
    if (r.error) setErr(r.error);
    await load(); changed();
  }
  useEffect(() => { load(); }, []);

  const cells = useMemo(() => Array.from({ length: 35 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; }), [start]);
  const shift = (weeks: number) => setStart((s) => { const d = new Date(s); d.setDate(d.getDate() + weeks * 7); return d; });
  const range = `${short(cells[0])} to ${short(cells[34])}`;
  const onDay = (d: Date) => pieces.filter((p) => new Date(p.scheduled_at!).toDateString() === d.toDateString());
  // the carousel and post slots still open in the next seven days (one of each a day), so the team can fill them from
  // the training material when the episodes don't
  const openText = useMemo(() => {
    const now = Date.now(), end = now + 7 * 864e5;
    const held = pieces.filter((p) => ["carousel", "post"].includes(p.kind) && p.scheduled_at && Date.parse(p.scheduled_at) >= now && Date.parse(p.scheduled_at) < end).length;
    return Math.max(0, 14 - held);
  }, [pieces]);
  const ws = weekOf(new Date()), we = new Date(ws.getTime() + 7 * 864e5);
  const week = pieces.filter((p) => { const t = new Date(p.scheduled_at!); return t >= ws && t < we; });
  const mix = ["reel", "carousel", "post"].map((k) => ({ k, n: week.filter((p) => p.kind === k).length }));
  const gaps = mix.filter((m) => !m.n).map((m) => (m.k === "post" ? "LinkedIn post" : m.k));
  const n = (...s: string[]) => s.reduce((a, k) => a + (pipeline[k] ?? 0), 0);

  async function save(id: string, patch: Record<string, unknown>) {
    const r = await fetch(`/api/pieces/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then((x) => x.json());
    if (r.error) setErr(r.error);
    await load(); changed();
    return r;
  }
  async function drop(day: Date, id: string) {
    setOver("");
    const p = pieces.find((x) => x.id === id);
    if (!p?.scheduled_at) return;
    const old = new Date(p.scheduled_at), next = new Date(day);
    next.setHours(old.getHours(), old.getMinutes(), 0, 0);
    if (next.toDateString() === old.toDateString()) return;
    setPieces((list) => list.map((x) => (x.id === id ? { ...x, scheduled_at: next.toISOString() } : x)));
    await save(id, { scheduled_at: next.toISOString() });
  }
  const open = (p: ViewPiece) => setSel(p);

  return (
    <>
      <section style={{ background: C.navy, color: "#fff" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "26px 28px 30px", display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 300px" }}>
            <div style={{ ...label, color: C.onNavy }}>This week · {short(ws)} to {short(new Date(we.getTime() - 864e5))}</div>
            <h1 style={{ margin: "8px 0 0", font: `800 36px/1.1 ${HEAD}`, letterSpacing: "-0.03em" }}>{loaded ? `${week.length} ${week.length === 1 ? "piece" : "pieces"} going out` : "Loading…"}</h1>
            <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
              {mix.map(({ k, n }) => <span key={k} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Glyph kind={k} light size={22} /><b style={{ font: `800 20px ${HEAD}` }}>{n}</b><span style={{ color: C.onNavy, fontSize: 13 }}>{k === "post" ? "posts" : `${k}s`}</span></span>)}
            </div>
            {loaded && gaps.length > 0 && <div style={{ marginTop: 10, fontSize: 13, color: "#c0ccd6" }}>No {gaps.join(" or ")} planned this week.</div>}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", rowGap: 14 }}>
            <Stat n={n("ready")} text={`Waiting for ${OWNER}`} blue href="/queue" />
            <Stat n={n("kept", "making", "draft", "changes", "approved")} text="In edit" href="/episodes" />
            <Stat n={n("scheduled", "posted")} text="Scheduled" />
            <Stat n={n("concept")} text="Unreviewed" href="/episodes" />
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "22px 28px 40px", display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section style={{ flex: "999 1 720px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <button style={{ ...link, textDecoration: "none", fontSize: 22, padding: "0 6px" }} aria-label="Earlier weeks" onClick={() => shift(-4)}>‹</button>
            <h2 style={{ margin: 0, font: `800 26px ${HEAD}`, letterSpacing: "-0.02em", minWidth: 250 }}>{range}</h2>
            <button style={{ ...link, textDecoration: "none", fontSize: 22, padding: "0 6px" }} aria-label="Later weeks" onClick={() => shift(4)}>›</button>
            {start.getTime() !== weekOf(new Date()).getTime() && <button style={{ ...link, fontSize: 13 }} onClick={() => setStart(weekOf(new Date()))}>This week</button>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: C.muted }}>
              {([[`Waiting for ${OWNER}`, C.accent, ""], ["Scheduled", GROUP.scheduled.color, ""], ["In edit", GROUP.edit.color, ""], ["Unreviewed", "#fff", `1.5px dashed ${GROUP.unreviewed.color}`]] as const).map(([t, bg, border]) => (
                <span key={t} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span aria-hidden style={{ width: 9, height: 9, borderRadius: 5, background: bg, border: border || "none" }} />{t}</span>
              ))}
              <span>Drag a piece to move it.</span>
            </div>
          </div>
          <p style={{ margin: "-6px 0 12px", fontSize: 13, color: C.text }}>Kept ideas take the next open slot: {RHYTHM}, one reel, one carousel and one post, plus the long-form episode {EPISODE_SLOT}.{openText > 0 && <> {openText} carousel and post slot{openText === 1 ? " is" : "s are"} open in the next seven days. <a href="/episodes#brain" style={{ ...link, fontSize: 13 }}>Fill them from the training material</a>.</>}</p>
          {/* any other scheduler: the next two weeks as one CSV for a bulk upload (app/api/calendar/export) */}
          {SCHEDULER_ID === "export" && <p style={{ margin: "-4px 0 12px", fontSize: 13, color: C.text }}>Posting with {SCHEDULER_NAME}? <a href="/api/calendar/export?days=14" style={{ ...link, fontSize: 13 }}>Download the next two weeks as a CSV</a> for a bulk upload: every approved piece, each network&apos;s caption and links to its files.</p>}
          {err && <p style={{ color: C.warn }}>{err}</p>}
          <div style={{ ...card, overflowX: "auto" }}>
            <div style={{ minWidth: 820, display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              {DAYS.map((d) => <div key={d} style={{ ...label, padding: "10px 12px", borderBottom: `1px solid ${C.line}` }}>{d}</div>)}
              {cells.map((d) => {
                const key = d.toDateString(), today = key === new Date().toDateString(), past = d < weekOf(new Date()) || (d < new Date() && !today);
                const inMonth = !past;
                return (
                  <div key={key} className={over === key ? "drop" : undefined} onDragOver={(e) => { e.preventDefault(); if (over !== key) setOver(key); }} onDragLeave={() => setOver("")} onDrop={(e) => { e.preventDefault(); drop(d, e.dataTransfer.getData("text/plain")); }}
                    style={{ minHeight: 132, padding: 8, borderRight: "1px solid #eef2f5", borderBottom: "1px solid #eef2f5", background: inMonth ? "#fff" : "#fafbfc" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ display: "inline-grid", placeItems: "center", minWidth: 24, height: 24, borderRadius: 12, background: today ? C.navy : "transparent", color: today ? "#fff" : inMonth ? C.ink : "#8796a3", font: `700 13px ${HEAD}` }}>{d.getDate()}</span>
                      {(d.getDate() === 1 || d.getTime() === cells[0].getTime()) && <span style={{ ...label, fontSize: 10.5 }}>{d.toLocaleDateString("en-US", { month: "short" })}</span>}
                    </div>
                    {onDay(d).map((p) => <Tile key={p.id} p={p} selected={sel?.id === p.id} onOpen={() => open(p)} />)}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside style={{ flex: "1 1 340px", maxWidth: 430, display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 84, maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
          {(
            <>
              {/* what's next, then what's coming up; a piece opens in the review sheet */}
              {!isOwner && n("concept") + n("kept") + n("draft") + n("changes") > 0 && (
                <a href="/episodes" className="card-h" style={{ ...card, border: `1.5px solid ${C.navy}`, padding: "18px 20px", textDecoration: "none", color: C.ink, display: "block" }}>
                  <div style={label}>Next for you</div>
                  <div style={{ font: `700 16px/1.4 ${HEAD}`, marginTop: 6 }}>{n("concept")} {n("concept") === 1 ? "idea" : "ideas"} to keep or kill · {n("kept")} kept to make · {n("draft") + n("changes")} with {COACH}&apos;s notes</div>
                  <div style={{ ...btn, marginTop: 12 }}>Open the board</div>
                </a>
              )}
              {n("ready") > 0 && isOwner && (
                <a href="/queue" className="card-h" style={{ borderRadius: 6, background: C.accent, color: C.accentInk, padding: "20px 22px", textDecoration: "none", display: "block" }}>
                  <div style={{ font: `800 40px/1 ${HEAD}`, letterSpacing: "-0.04em" }}>{n("ready")}</div>
                  <div style={{ font: `700 16px/1.35 ${HEAD}`, marginTop: 6 }}>{n("ready") === 1 ? "piece passed" : "pieces passed"} {COACH} and {n("ready") === 1 ? "is" : "are"} waiting for {OWNER}.</div>
                  <div style={{ ...btn, marginTop: 14 }}>Open {OWNER}&apos;s queue</div>
                </a>
              )}
              {asks > 0 && isOwner && (
                <a href="/queue?tab=questions" className="card-h" style={{ ...card, border: `1.5px solid ${C.accent}`, padding: "16px 20px", textDecoration: "none", color: C.ink, display: "flex", gap: 14, alignItems: "center" }}>
                  <span style={{ font: `800 34px/1 ${HEAD}`, letterSpacing: "-0.04em", color: C.deep }}>{asks}</span>
                  <span style={{ font: `700 15px/1.35 ${HEAD}` }}>{asks === 1 ? "question" : "questions"} from {COACH} that only {OWNER} can answer</span>
                </a>
              )}
              {undated > 0 && (
                <div style={{ ...card, border: `1.5px solid ${C.navy}`, padding: "16px 20px", display: "grid", gap: 10 }}>
                  <div style={{ font: `700 16px/1.4 ${HEAD}` }}>{undated} {undated === 1 ? "piece has" : "pieces have"} no date yet</div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.45 }}>Each takes the next open day for its kind, the most finished first. Drag any of them after.</div>
                  <button style={{ ...btn, justifySelf: "start" }} disabled={filling} onClick={fill}>{filling ? "Placing them…" : "Put them on the calendar"}</button>
                </div>
              )}
              <div style={{ ...card, padding: 18 }}>
                <div style={label}>Coming up</div>
                {pieces.filter((p) => new Date(p.scheduled_at!) >= new Date()).slice(0, 8).map((p) => (
                  <button key={p.id} onClick={() => open(p)} style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", textAlign: "left", background: "none", border: 0, borderTop: "1px solid #eef2f5", padding: "10px 0", cursor: "pointer", font: "14px/1.4 Poppins, Arial, sans-serif", color: C.ink }}>
                    <Glyph kind={p.kind} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: C.muted, fontSize: 12 }}>{slotStamp(p.scheduled_at!)}</span><br />
                      <b>#{p.num}</b> {p.title}
                    </span>
                    <span style={chip(STATUS[p.status] ?? STATUS.draft)}>{stateLabel(p)}</span>
                  </button>
                ))}
                {loaded && !pieces.length && <p style={{ margin: "10px 0 0", color: C.muted, fontSize: 14 }}>Nothing planned yet. Open an episode, make a few pieces and give them dates.</p>}
              </div>
              {waiting.length > 0 && <div style={{ fontSize: 13, color: C.muted }}>{waiting.length} more waiting for {OWNER} without a date.</div>}
            </>
          )}
        </aside>
      </main>
      {sel && <PieceSheet piece={sel} isOwner={isOwner} onClose={() => setSel(null)} onChanged={load} />}
    </>
  );
}
