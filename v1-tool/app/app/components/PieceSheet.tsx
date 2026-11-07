"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Preview from "./Preview";
import CoachCard from "./CoachCard";
import Caption from "./Caption";
import SendCs from "./SendCs";
import Glyph from "./Glyph";
import { C, HEAD, STATUS, btn, hot, ghost, link, label, chip, input, changed, kindName, stageText } from "../../lib/ui";
import { stageLine, isAnimated } from "../../lib/stages";
import { PLATFORM, LABEL, LIMIT, ownCaptions, platformsFor, channelsFor, chosen, type Platform } from "../../lib/platforms";
import ImagePick from "./ImagePick";
import { CADENCE, slotStamp, toSlotInput, fromSlotInput } from "../../lib/cadence";
import { drafting, type ViewPiece } from "../../lib/types";
import { OWNER, COACH, TZ_LABEL, SCHEDULER_NAME } from "../../lib/brand";

const REASONS = ["Voice", "Facts", "Hook", "Wrong offer", "Design", "Not worth posting"];
// The way out, the same four steps for every piece: the team makes it, the coach checks it, the owner signs off, and
// only then does it go to the scheduler.
const STEPS = ["Team makes it", `${COACH} checks`, `${OWNER} approves`, `Scheduled in ${SCHEDULER_NAME}`];
const MADE = ["draft", "changes", "ready", "approved", "scheduled", "posted"];
// the owner's time zone, the slots' zone (lib/cadence.ts)
const local = toSlotInput;
const stamp = (iso: string) => slotStamp(iso);
const day = (iso: string) => slotStamp(iso, { weekday: "short", month: "short", day: "numeric" });

// The step a piece is on (4 once the scheduler has it scheduled). An app status of "scheduled" only means the owner
// approved it and it has a date; nothing posts until the scheduler has it.
function stepOf(p: ViewPiece) {
  const cs = p.media?.cs;
  if (p.status === "posted" || (cs?.mode === "scheduled" && cs.results.some((r) => r.ok))) return 4;
  if (p.status === "approved" || p.status === "scheduled") return 3;
  if (p.status === "ready") return 2;
  if (p.status === "draft" && !p.review) return 1;
  return 0;
}

// One sentence on where it stands and what happens next, for whoever is looking.
function whereNow(p: ViewPiece, step: number, isOwner: boolean) {
  const r = p.review, s = p.status;
  if (step === 4) return p.status === "posted" ? "Posted." : `Scheduled in ${SCHEDULER_NAME}${p.scheduled_at ? ` for ${stamp(p.scheduled_at)}` : ""}.`;
  if (step === 3) return isOwner ? `You approved it. It goes out once it's scheduled in ${SCHEDULER_NAME}.` : `${OWNER} approved it and schedules it in ${SCHEDULER_NAME}.`;
  if (step === 2) return isOwner ? `${COACH} passed it${r ? ` (${r.score}/100)` : ""}. Your call.` : `With ${OWNER}. Nothing to do until ${OWNER} decides.`;
  if (s === "concept" || s === "kept") return "Still an idea. The team makes it first.";
  if (s === "making") return `Being made on a cloud machine. About 10 minutes, then ${COACH} reviews it.`;
  if (s === "changes") return isOwner ? "You sent it back. The team is making your changes." : `${OWNER} sent it back. Make the changes in the episode.`;
  if (!r) return `Made. ${COACH} hasn't checked it yet.`;
  const v = `${r.verdict === "rethink" ? "rethink" : "fix first"}, ${r.score}/100`;
  return isOwner ? `With the team. ${COACH} wants changes first (${v}). You can still approve it as it is.` : `${COACH} wants changes first (${v}). Make them in the episode.`;
}

type Props = { piece: ViewPiece; isOwner: boolean; onClose: () => void; onChanged: () => void };

// A piece opened from the calendar: the whole post (the picture, the caption, where and when it goes out), where it
// stands on the way out, and the one thing to do next. Replaces the side drawer, which showed slides without the
// caption and had no way to sign off.
export default function PieceSheet({ piece, isOwner, onClose, onChanged }: Props) {
  const [p, setP] = useState(piece);
  const [when, setWhen] = useState(piece.scheduled_at ? local(piece.scheduled_at) : "");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const [back, setBack] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [rule, setRule] = useState(false);
  const [editCap, setEditCap] = useState(false);
  // the next open day in the posting rhythm, offered when the piece has no date or its date has passed
  const [nextOpen, setNextOpen] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { setP(piece); setWhen(piece.scheduled_at ? local(piece.scheduled_at) : ""); setBack(false); setEditCap(false); setErr(""); }, [piece.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setNextOpen(null);
    if (!CADENCE[p.kind]) return;
    fetch(`/api/calendar/slots?kind=${p.kind}&except=${p.id}`).then((r) => r.json()).then((r) => setNextOpen(r.at ?? null)).catch(() => {});
  }, [p.id, p.kind, p.scheduled_at]);
  // set up once: the calendar reloads behind the sheet after every save, and that mustn't move the focus
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    box.current?.focus();
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, []);

  const refresh = async () => {
    const r = await fetch(`/api/pieces/${p.id}`).then((x) => x.json()).catch(() => ({}));
    if (r.piece) setP((cur) => ({ ...cur, ...r.piece }));
    onChanged(); changed();
  };
  async function call(url: string, method: string, body: unknown, wait: string) {
    setBusy(wait); setErr("");
    const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
    setBusy("");
    if (r.error) { setErr(r.error); return null; }
    await refresh();
    return r;
  }
  // the episode's guest, for the tag previews and the Instagram invite
  const guest = p.studio_episodes ? { name: p.studio_episodes.guest, handles: p.studio_episodes.guest_handles ?? {} } : undefined;
  const patch = (body: Record<string, unknown>, done = "Saved.") => call(`/api/pieces/${p.id}`, "PATCH", body, "Saving…").then((r) => { if (r) { setSaved(done); setTimeout(() => setSaved(""), 2500); } return r; });
  const decide = (decision: string, extra: Record<string, unknown> = {}) => call(`/api/pieces/${p.id}/decide`, "POST", { decision, ...extra }, decision === "approve" ? "Approving…" : decision === "sendback" ? "Sending it back…" : `Sending to ${OWNER}…`);
  const send = async (mode: "draft" | "scheduled", ask = true) => {
    if (mode === "scheduled" && ask && !window.confirm(`Schedule this in ${SCHEDULER_NAME}? It goes out ${p.scheduled_at ? stamp(p.scheduled_at) : "on its date"} on ${nets.map((n) => LABEL[n]).join(", ")}.`)) return;
    const r = await call(`/api/pieces/${p.id}/send`, "POST", { mode }, mode === "draft" ? `Sending one draft per network to ${SCHEDULER_NAME}…` : `Scheduling it in ${SCHEDULER_NAME}…`);
    const bad = ((r?.results ?? []) as { ok: boolean; platform: string; error?: string }[]).filter((x) => !x.ok);
    if (bad.length) setErr(`${bad.length < (r.results?.length ?? 0) ? "Scheduled, except" : "Not scheduled on"} ${bad.map((x) => LABEL[x.platform as Platform] ?? x.platform).join(", ")}: ${bad[0].error ?? `${SCHEDULER_NAME} turned it down`}`);
  };
  // One click: approving a dated piece also schedules it in the scheduler for its date and channels.
  // With no date, or a date that has passed, it's approved only and the sheet asks for a date.
  const dated = !!p.scheduled_at && new Date(p.scheduled_at).getTime() > Date.now() + 5 * 60000;
  // a date that has passed gets a prompt to move it, never an approval that quietly doesn't schedule
  const past = !!p.scheduled_at && !dated && stepOf(p) < 4;
  const moveTo = (at: string) => { setWhen(local(at)); patch({ scheduled_at: at }, "Date saved."); };
  const approve = async () => {
    if (!(await decide("approve"))) return;
    if (dated) await send("scheduled", false);
  };

  const step = stepOf(p);
  const ownersTurn = step === 2 || step === 3;
  const made = MADE.includes(p.status);
  const chans = chosen(p.kind, p.channels, !!p.media?.image);
  const nets: Platform[] = platformsFor(p.kind, chans);
  const options = channelsFor(p.kind);
  const saveWhen = () => {
    const iso = when ? fromSlotInput(when) : null;
    if (!iso) return;
    if (!p.scheduled_at || iso !== new Date(p.scheduled_at).toISOString()) patch({ scheduled_at: iso }, "Date saved.");
  };
  const toggle = (c: string) => {
    const on = nets.includes(PLATFORM[c]);
    if (on && nets.length === 1) return;
    patch({ channels: options.filter((x) => (x === c ? !on : nets.includes(PLATFORM[x]))) }, "Channels saved.");
  };
  // Set within a day but not in the scheduler: nothing will post, and it should say so.
  const soon = dated && step < 4 && new Date(p.scheduled_at!).getTime() - Date.now() < 24 * 3600 * 1000;
  const own = ownCaptions(p.caption, p.captions);
  const short = nets.filter((n) => !own[n] && (p.caption ?? "").trim().length > LIMIT[n]);
  const episodeHref = `/episodes/${p.episode_id}?piece=${p.id}`;

  // The one thing to do next, by whose turn it is.
  let action: ReactNode = null;
  // a reel or carousel goes out with its caption, so it can't be signed off without one
  const noCaption = (p.kind === "reel" || p.kind === "carousel") && !(p.caption ?? "").trim() && !Object.keys(own).length;
  const moveBtn = nextOpen ? <button style={{ ...btn, minHeight: 52, padding: "0 24px", fontSize: 15 }} disabled={!!busy} onClick={() => moveTo(nextOpen)}>Move to {day(nextOpen)}</button> : null;
  if (isOwner && made && step <= 3 && past && !(step <= 2 && noCaption)) {
    action = (
      <>
        {step <= 2 && <button style={{ ...ghost, minHeight: 52, padding: "0 22px" }} disabled={!!busy} onClick={() => setBack(true)}>Send back</button>}
        {moveBtn}
      </>
    );
  } else if (isOwner && made && step <= 2 && noCaption) {
    action = (
      <>
        <button style={{ ...ghost, minHeight: 52, padding: "0 22px" }} disabled={!!busy} onClick={() => setBack(true)}>Send back</button>
        <button style={{ ...btn, minHeight: 52, padding: "0 24px", fontSize: 15 }} disabled={!!busy} onClick={() => setEditCap(true)}>Write the caption</button>
      </>
    );
  } else if (isOwner && made && step <= 2) {
    action = (
      <>
        <button style={{ ...ghost, minHeight: 52, padding: "0 22px" }} disabled={!!busy} onClick={() => setBack(true)}>Send back</button>
        <button style={step === 2 ? hot : { ...btn, minHeight: 52, padding: "0 24px", fontSize: 15 }} disabled={!!busy} onClick={approve}>
          {step === 2 ? (dated ? `Approve and schedule for ${day(p.scheduled_at!)}` : "Approve") : dated ? "Approve as it is and schedule" : "Approve as it is"}
        </button>
      </>
    );
  } else if (isOwner && step === 3) {
    action = dated
      ? <button style={hot} disabled={!!busy} onClick={() => send("scheduled")}>Schedule in {SCHEDULER_NAME} for {day(p.scheduled_at!)}</button>
      : <span style={{ fontSize: 14, color: C.text }}>{p.scheduled_at ? "Its date has passed. Pick a new one above, then schedule it." : "Give it a date above, then schedule it."}</span>;
  } else if (!isOwner && step === 1) {
    action = <button style={btn} disabled={!!busy} onClick={() => call(`/api/pieces/${p.id}/review`, "POST", undefined, `${COACH} is checking it (about a minute)…`)}>Ask {COACH}</button>;
  } else if (!isOwner && step === 0 && p.status === "draft" && p.review?.verdict === "ready") {
    action = <button style={btn} disabled={!!busy} onClick={() => decide("send")}>Send to {OWNER}</button>;
  } else if (!isOwner && step === 0) {
    action = <a style={btn} href={episodeHref}>Finish it in the episode</a>;
  } else if (!isOwner && step === 3) {
    action = <button style={ghost} disabled={!!busy} onClick={() => send("draft")}>Send as drafts to {SCHEDULER_NAME}</button>;
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`#${p.num} ${p.title}`} onClick={onClose} className="psheet-wrap"
      style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(11,27,39,.55)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "3vh 16px" }}>
      {/* on a phone the sheet is the whole screen, the header tighter and the two buttons side by side */}
      <style>{`@media (max-width: 640px) {
        .psheet-wrap { padding: 0 !important; }
        .psheet { max-height: 100dvh !important; height: 100dvh; border-radius: 0 !important; }
        .psheet h2 { font-size: 19px !important; }
        .psheet-step { font-size: 10.5px !important; }
        .psheet-note { flex-basis: 100% !important; }
        .psheet-foot > button, .psheet-foot > a { flex: 1 1 0; padding: 0 12px !important; font-size: 15px !important; }
      }`}</style>
      <div ref={box} tabIndex={-1} className="rise psheet" onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 1080, maxHeight: "94vh", background: "#fff", borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden", outline: "none", boxShadow: "0 30px 80px rgba(11,27,39,.35)" }}>

        <header style={{ padding: "18px 22px 16px", borderBottom: `1px solid ${C.line}`, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Glyph kind={p.kind} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={label}>#{p.num} · {kindName(p, isAnimated(p))}</span>
                <span style={chip(STATUS[p.status] ?? STATUS.draft)}>{STATUS[p.status]?.label}</span>
                {stageLine(p) && <span style={stageText}>{stageLine(p)}</span>}
              </div>
              <h2 style={{ margin: "4px 0 0", font: `800 23px/1.2 ${HEAD}`, letterSpacing: "-0.02em" }}>{p.title}</h2>
              {p.studio_episodes && <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>From {p.studio_episodes.title} · <a href={episodeHref} style={{ ...link, fontSize: 13 }}>Open in the episode</a></div>}
            </div>
            <button aria-label="Close" onClick={onClose} style={{ ...ghost, minHeight: 40, width: 40, padding: 0, fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
          {/* where it is on the way out: done steps filled, the current one marked (the accent when it's the owner's turn) */}
          <div style={{ display: "grid", gap: 8 }}>
            <ol aria-label="Where it is" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
              {STEPS.map((s, i) => {
                const done = i < step, now = i === step, blue = now && ownersTurn;
                return (
                  <li key={s} aria-current={now ? "step" : undefined} style={{ display: "grid", gap: 6 }}>
                    <span style={{ height: 6, borderRadius: 3, background: done ? C.navy : blue ? C.accent : now ? C.text : C.line }} />
                    <span className="psheet-step" style={{ font: `${now ? 800 : 600} 12px/1.3 ${HEAD}`, color: done || now ? C.ink : C.muted }}>{s}</span>
                  </li>
                );
              })}
            </ol>
            <div style={{ fontSize: 14, color: C.text, lineHeight: 1.45 }}>{whereNow(p, step, isOwner)}</div>
            {(soon || past) && (
              <div style={{ fontSize: 13.5, color: C.warn, lineHeight: 1.45, fontWeight: 600 }}>
                {past ? `Its date, ${stamp(p.scheduled_at!)}, has passed. Move it to an open day${step < 3 ? " before it's approved" : " to schedule it"}.`
                  : `Set for ${stamp(p.scheduled_at!)}, but nothing posts until ${step < 3 ? "it's approved and " : "it's "}scheduled in ${SCHEDULER_NAME}.`}
              </div>
            )}
          </div>
        </header>

        <div style={{ overflowY: "auto", padding: "18px 22px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "start" }}>
          <section style={{ display: "flex", justifyContent: "center", padding: 14, background: C.soft, borderRadius: 6 }}>
            {made || p.status === "making" ? <Preview p={p} width={400} /> : <div style={{ padding: 30, color: C.muted, fontSize: 14, textAlign: "center" }}>{p.hook || "Not made yet."}</div>}
          </section>

          <section style={{ display: "grid", gap: 18, minWidth: 0 }}>
            {/* when and where: each change saves on its own */}
            <div style={{ display: "grid", gap: 12 }}>
              <div style={label}>Goes out</div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <input type="datetime-local" aria-label={`Date and time, ${TZ_LABEL}`} title={TZ_LABEL} value={when} onChange={(e) => setWhen(e.target.value)} onBlur={saveWhen} onKeyDown={(e) => { if (e.key === "Enter") saveWhen(); }} style={{ ...input, width: "auto", flex: "1 1 220px" }} />
                {p.scheduled_at && <button style={{ ...link, fontSize: 13, color: C.muted }} disabled={!!busy} onClick={async () => { if (await patch({ scheduled_at: null }, "Taken off the calendar.")) onClose(); }}>Take off the calendar</button>}
              </div>
              <div style={{ display: "flex", gap: "8px 16px", flexWrap: "wrap", fontSize: 14 }}>
                {options.map((c) => {
                  const on = nets.includes(PLATFORM[c]);
                  return <label key={c} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", minHeight: 32 }}><input type="checkbox" checked={on} disabled={on && nets.length === 1} onChange={() => toggle(c)} /> {c}</label>;
                })}
              </div>
              {nextOpen && (past || !p.scheduled_at) && (
                <button style={{ ...link, justifySelf: "start", fontSize: 13.5 }} disabled={!!busy} onClick={() => moveTo(nextOpen)}>Next open day: {stamp(nextOpen)}</button>
              )}
              {saved && <span style={{ fontSize: 12.5, color: C.muted }}>{saved}</span>}
            </div>

            {p.kind === "post" && made && <ImagePick p={p} onSave={(image) => patch({ image }, image ? "Image attached." : "Image taken off.")} />}

            {p.kind !== "post" && p.kind !== "episode" && (
              editCap ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <Caption key={p.id} kind={p.kind} channels={chans} captions={p.captions ?? {}} fallback={p.caption ?? ""} leadMagnetId={p.lead_magnet_id ?? null} busy={!!busy} guest={guest}
                    onChannels={(c) => patch({ channels: c }, "Channels saved.")}
                    onSave={(o, s) => patch({ captions: o, caption: s }, "Caption saved.")}
                    onWrite={() => call(`/api/pieces/${p.id}/caption`, "POST", {}, "Writing the caption (about a minute)…")}
                    onLeadMagnet={(id) => patch({ lead_magnet_id: id })} />
                  <button style={{ ...link, justifySelf: "start", fontSize: 13 }} onClick={() => setEditCap(false)}>Done editing</button>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={label}>Caption</span>
                    <span style={{ fontSize: 12, color: C.muted }}>the same on every network</span>
                    <button style={{ ...link, marginLeft: "auto", fontSize: 13 }} onClick={() => setEditCap(true)}>{p.caption ? "Edit" : "Write it"}</button>
                  </div>
                  {p.caption
                    ? <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 340, overflowY: "auto", padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 6 }}>{p.caption}</p>
                    : drafting(p) ? <p style={{ margin: 0, fontSize: 13.5, color: C.text }}>The writer is drafting it now. It shows here in a minute or two.</p>
                    : <p style={{ margin: 0, fontSize: 13.5, color: C.warn }}>No caption yet. It needs one before it goes out.</p>}
                  {short.length > 0 && <span style={{ fontSize: 12.5, color: C.muted }}>{short.map((n) => LABEL[n]).join(" and ")} {short.length === 1 ? "gets" : "get"} a shortened version to fit {short.length === 1 ? "its" : "their"} limit.</span>}
                  {Object.entries(own).filter(([k]) => nets.includes(k as Platform)).map(([k, v]) => (
                    <details key={k}><summary style={{ font: `700 13px ${HEAD}`, cursor: "pointer" }}>{LABEL[k as Platform] ?? k} has its own caption</summary><p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{v}</p></details>
                  ))}
                </div>
              )
            )}

            {made && <CoachCard review={p.review} compact />}
            {step >= 3 && <SendCs p={p} isOwner={isOwner} busy={!!busy} guest={guest} link={p.studio_episodes?.link ?? null} onCollab={(on) => patch({ collab: on })} onSend={send} onRefresh={() => call(`/api/pieces/${p.id}/send`, "GET", undefined, `Checking ${SCHEDULER_NAME}…`)} onHandoff={(undo) => call(`/api/pieces/${p.id}/handoff`, "POST", { undo }, undo ? "Taking it back…" : "Marking it scheduled…")} />}
          </section>
        </div>

        {/* the one next step; sending back opens the owner's reasons in place */}
        <footer className="psheet-foot" style={{ borderTop: `1px solid ${C.line}`, padding: "12px 22px calc(12px + env(safe-area-inset-bottom))", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", background: "#fff" }}>
          {back ? (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {REASONS.map((r) => <button key={r} onClick={() => setReasons(reasons.includes(r) ? reasons.filter((x) => x !== r) : [...reasons, r])} style={{ ...chip(reasons.includes(r) ? { label: r, bg: C.navy, fg: "#fff" } : { label: r, bg: "#fff", fg: C.ink, border: `1px solid ${C.hair}` }), minHeight: 34, padding: "0 12px", fontSize: 12, cursor: "pointer" }}>{r}</button>)}
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change?" style={{ ...input, flex: "1 1 240px", width: "auto" }} />
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={rule} onChange={(e) => setRule(e.target.checked)} /> Make this a rule for {COACH}</label>
              <button style={btn} disabled={!!busy || (!note.trim() && !reasons.length)} onClick={async () => { if (await decide("sendback", { note, reasons, rule })) { setBack(false); setNote(""); setReasons([]); setRule(false); } }}>Send it back</button>
              <button style={link} onClick={() => setBack(false)}>Cancel</button>
            </>
          ) : (
            <>
              <span className="psheet-note" style={{ flex: "1 1 240px", fontSize: 13.5, color: err ? C.warn : C.text, lineHeight: 1.45 }}>
                {busy || err || (action ? (isOwner && past && noCaption && step <= 2 ? `It needs a caption and a new date${nextOpen ? ` (the next open day is ${stamp(nextOpen)})` : ""} before you can approve it.`
                  : isOwner && past ? (nextOpen ? `The next open day for this ${p.kind === "episode" ? "episode" : p.kind} is ${stamp(nextOpen)}. Or pick a date above.` : "Pick a new date above.")
                  : isOwner && made && step <= 2 && noCaption ? "It needs a caption before you can approve it."
                  : isOwner && step < 2 && made ? `${COACH} hasn't passed it yet. Your approval is the final word${dated ? `, and it goes to ${SCHEDULER_NAME} for ${stamp(p.scheduled_at!)}` : ""}.`
                  : isOwner && step === 2 ? (dated ? `It goes out ${stamp(p.scheduled_at!)} on ${nets.map((n) => LABEL[n]).join(", ")}.` : p.scheduled_at ? "Its date has passed: approving won't schedule it. Pick a new date first." : "No date yet: approving won't schedule it.") : "")
                  : step === 2 ? `Waiting for ${OWNER}.` : step === 4 ? "Nothing left to do here." : !made ? "Nothing to approve yet." : "")}
              </span>
              {action}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
