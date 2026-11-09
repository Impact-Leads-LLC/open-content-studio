"use client";
import { useEffect, useRef, useState } from "react";
import Preview from "../components/Preview";
import PieceSheet from "../components/PieceSheet";
import { LABEL, ownCaptions, type Platform } from "../../lib/platforms";
import CoachCard from "../components/CoachCard";
import Glyph, { Channels } from "../components/Glyph";
import Dictate from "../components/Dictate";
import { C, HEAD, VERDICT, STATUS, btn, hot, ghost, link, card, label, chip, input, who, isOwner as ownerSignedIn, changed, kindName, stageText } from "../../lib/ui";
import { OWNER, COACH, SCHEDULER_NAME, SCHEDULER_ID } from "../../lib/brand";
import { slotStamp } from "../../lib/cadence";
import { stageLine, isAnimated } from "../../lib/stages";
import type { ViewPiece } from "../../lib/types";

type Held = { id: string; num: number; kind: string; title: string; status: string; review: ViewPiece["review"]; episode_id: string; awareness?: string | null; funnel?: string | null };
type Data = { pieces: ViewPiece[]; held: Held[]; questions: ViewPiece[]; stats: { agree: number; total: number } };
type Tab = "pieces" | "questions";
const REASONS = ["Voice", "Facts", "Hook", "Wrong offer", "Design", "Not worth posting"];
const area = { ...input, padding: 12, minHeight: 112, font: "16px/1.55 Poppins, Arial, sans-serif", resize: "vertical" as const };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function post(id: string, decision: string, body: Record<string, unknown> = {}) {
  return fetch(`/api/pieces/${id}/decide`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, author: who(), ...body }) }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
}

export default function Queue() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("pieces");
  const [i, setI] = useState(0);
  const [mode, setMode] = useState<"idle" | "back">("idle");
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [rule, setRule] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(0);
  // The questions sitting: every question seen on this visit stays on screen, and answered ones fold up.
  const [seen, setSeen] = useState<ViewPiece[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [also, setAlso] = useState<Record<string, string[]>>({});
  const [sent, setSent] = useState<Record<string, { text: string; dropped?: boolean }>>({});
  const [peek, setPeek] = useState<string | null>(null);
  const [dropping, setDropping] = useState<string | null>(null);
  const dropAt = useRef(0);
  const boxes = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const first = useRef(true);
  const [me, setMe] = useState(OWNER);
  const [isOwner, setIsOwner] = useState(true);
  // a piece whose date has passed opens in the review sheet to get a new one
  const [sheet, setSheet] = useState<ViewPiece | null>(null);
  useEffect(() => { const read = () => { setMe(who()); setIsOwner(ownerSignedIn()); }; read(); window.addEventListener("studio:changed", read); return () => window.removeEventListener("studio:changed", read); }, []);

  const load = async () => {
    const r = await fetch("/api/queue").then((x) => x.json()).catch(() => ({ error: "Network error" }));
    if (r.error) return setErr(r.error);
    setD(r); setI((k) => Math.min(k, Math.max(0, r.pieces.length - 1)));
    const qs = r.questions as ViewPiece[];
    setSeen((s) => [...s.map((x) => qs.find((q) => q.id === x.id) ?? x), ...qs.filter((q) => !s.some((x) => x.id === q.id))]);
    if (first.current) {
      first.current = false;
      const want = new URLSearchParams(window.location.search).get("tab");
      setTab(want === "questions" || (!r.pieces.length && qs.length) ? "questions" : "pieces");
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (t: Tab) => { setTab(t); try { history.replaceState(null, "", t === "questions" ? "/queue?tab=questions" : "/queue"); } catch {} };
  const p = d?.pieces[i];
  const reset = () => { setMode("idle"); setReasons([]); setNote(""); setRule(false); setAnswer(""); };
  const setA = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }));
  // "Also use this answer for": the other open questions from the same episode, all ticked until the owner unticks one.
  const sibsOf = (q: ViewPiece) => seen.filter((x) => x.id !== q.id && x.episode_id === q.episode_id && !sent[x.id]);
  const picked = (q: ViewPiece) => also[q.id] ?? sibsOf(q).map((x) => x.id);
  const toggleAlso = (q: ViewPiece, other: string) => setAlso((a) => { const cur = a[q.id] ?? sibsOf(q).map((x) => x.id); return { ...a, [q.id]: cur.includes(other) ? cur.filter((x) => x !== other) : [...cur, other] }; });

  async function decide(decision: string, body: Record<string, unknown> = {}) {
    if (!p) return;
    setBusy(true); setErr("");
    const r = await post(p.id, decision, body);
    setBusy(false);
    if (r.error) return setErr(r.error);
    reset(); setDone((n) => n + 1); await load(); changed();
  }

  // One click: approving a dated piece also schedules it in the scheduler for its date and channels.
  // The approval stands if the scheduler turns a network down; the message says which, and the calendar can retry.
  const dated = (x?: ViewPiece) => !!x?.scheduled_at && new Date(x.scheduled_at).getTime() > Date.now() + 5 * 60000;
  const past = (x?: ViewPiece) => !!x?.scheduled_at && !dated(x);
  async function approve() {
    if (!p) return;
    setBusy(true); setErr("");
    const r = await post(p.id, "approve");
    if (r.error) { setBusy(false); return setErr(r.error); }
    // a scheduler the app doesn't post to: approving is all; the posting kit takes it from there
    if (dated(p) && SCHEDULER_ID !== "export") {
      const s = await fetch(`/api/pieces/${p.id}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "scheduled" }) }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
      const bad = ((s.results ?? []) as { ok: boolean; platform: string; error?: string }[]).filter((x) => !x.ok);
      if (s.error) setErr(`#${p.num} is approved, but ${SCHEDULER_NAME} didn't take it: ${s.error} Schedule it from the calendar.`);
      else if (bad.length) setErr(`#${p.num} is approved and scheduled, except ${bad.map((x) => LABEL[x.platform as Platform] ?? x.platform).join(", ")}: ${bad[0].error ?? `${SCHEDULER_NAME} turned it down`}`);
    }
    setBusy(false); reset(); setDone((n) => n + 1); await load(); changed();
  }

  // One answer can cover several pieces from the same episode when the coach asked about the same thing.
  async function answerQ(q: ViewPiece) {
    const text = (answers[q.id] ?? "").trim();
    if (!text || busy) return;
    const ids = [q.id, ...picked(q).filter((x) => !sent[x])];
    setBusy(true); setErr("");
    for (const pid of ids) {
      const r = await post(pid, "answer", { note: text });
      if (r.error) { setBusy(false); return setErr(r.error); }
      setSent((s) => ({ ...s, [pid]: { text } }));
    }
    setBusy(false); changed(); load();
    const next = seen.find((x) => !ids.includes(x.id) && !sent[x.id]);
    if (next) setTimeout(() => boxes.current[next.id]?.focus(), 80);
  }
  async function dropQ(q: ViewPiece) {
    setBusy(true); setErr("");
    const r = await post(q.id, "drop", { note: (answers[q.id] ?? "").trim() });
    setBusy(false); setDropping(null);
    if (r.error) return setErr(r.error);
    setSent((s) => ({ ...s, [q.id]: { text: "", dropped: true } })); changed(); load();
  }
  // "Use this fix": swap in the coach's exact wording in the post or the captions, without sending the piece back.
  async function applyFix(q: ViewPiece, f: { before: string; after: string }) {
    const body: Record<string, unknown> = {};
    if (q.body?.includes(f.before)) body.body = q.body.split(f.before).join(f.after);
    // the shared caption and any network's own caption
    const caps = Object.fromEntries(Object.entries(q.captions ?? {}).map(([k, v]) => [k, v?.split(f.before).join(f.after)]));
    if (JSON.stringify(caps) !== JSON.stringify(q.captions ?? {})) body.captions = caps;
    if (q.caption?.includes(f.before)) body.caption = q.caption.split(f.before).join(f.after);
    if (!Object.keys(body).length) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/pieces/${q.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (r.error) return setErr(r.error);
    load();
  }
  // Undo a drop: the piece goes back to the team where it was.
  async function restoreQ(q: ViewPiece) {
    setBusy(true); setErr("");
    const r = await post(q.id, "restore", {});
    setBusy(false);
    if (r.error) return setErr(r.error);
    setSent((s) => { const n = { ...s }; delete n[q.id]; return n; }); changed(); load();
  }
  // The confirm opens where the first click landed, so a quick second click is ignored for a moment.
  const askDrop = (id: string) => { setDropping(id); dropAt.current = Date.now(); };

  const st = d?.stats;
  const asks = d?.questions.length ?? 0;
  const answered = seen.filter((q) => sent[q.id]).length;
  const current = seen.find((q) => !sent[q.id])?.id;
  const tabs: [Tab, number, string][] = [["pieces", d?.pieces.length ?? 0, "to approve"], ["questions", asks, "to answer"]];

  return (
    <>
      <section style={{ background: C.navy, color: "#fff" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "26px 28px 28px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 380px" }}>
            <div style={{ ...label, color: C.onNavy }}>{OWNER}&apos;s queue</div>
            <h1 style={{ margin: "8px 0 0", font: `800 36px/1.1 ${HEAD}`, letterSpacing: "-0.03em" }}>
              {!d ? "Loading…"
                : tab === "pieces" ? (d.pieces.length ? <><span style={{ color: C.accent }}>{d.pieces.length}</span> {d.pieces.length === 1 ? "piece passed" : "pieces passed"} {COACH}</> : "Nothing waiting")
                : seen.length && answered === seen.length ? "That's every question"
                : asks ? <><span style={{ color: C.accent }}>{asks}</span> {asks === 1 ? "question" : "questions"} only you can answer</> : "No questions for you"}
            </h1>
            <div style={{ marginTop: 8, fontSize: 14, color: "#c0ccd6", lineHeight: 1.5, maxWidth: 620 }}>
              {!d ? "" : tab === "pieces"
                ? <>{plural(d.held.length, "more is", "more are")} still with the team.{done ? ` You've decided ${done} this session.` : ""}{st && st.total ? <> {COACH} agreed with your call <b style={{ color: "#fff" }}>{st.agree} of {st.total}</b> times.</> : ""}</>
                : `${COACH} can't write your take on these without you. Say it the way you would on a call. The team works your words into the piece.`}
            </div>
          </div>
          <div role="tablist" aria-label={`What's waiting on ${OWNER}`} style={{ display: "flex", gap: 10 }}>
            {tabs.map(([t, n, l]) => {
              const on = tab === t;
              return (
                <button key={t} role="tab" aria-selected={on} onClick={() => go(t)} className="tile" style={{ minWidth: 148, padding: "14px 18px 12px", borderRadius: 6, border: `1.5px solid ${on ? C.accent : "rgba(255,255,255,.2)"}`, background: on ? C.navy2 : "transparent", color: "#fff", textAlign: "left", cursor: "pointer", fontFamily: HEAD }}>
                  <div style={{ font: `800 38px/1 ${HEAD}`, letterSpacing: "-0.04em", color: n ? C.accent : "#fff" }}>{d ? n : "·"}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: on ? "#fff" : "#c0ccd6", marginTop: 6 }}>{l}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1300, margin: "0 auto", padding: "24px 28px 120px" }}>
        {err && <div style={{ ...card, padding: "10px 14px", marginBottom: 14, color: C.warn }}>{err}</div>}

        {tab === "questions" && d && (
          <div style={{ display: "grid", gap: 16, maxWidth: 980 }}>
            {!isOwner && seen.some((q) => !sent[q.id]) && (
              <div style={{ ...card, padding: "12px 16px", fontSize: 14, lineHeight: 1.5, border: `1.5px solid ${C.navy}` }}>
                You&apos;re working as <b>{me}</b>. These answers become {OWNER}&apos;s take in {OWNER}&apos;s own words, so only {OWNER} answers them, signed in with the owner&apos;s account.
              </div>
            )}
            {seen.length > 0 && (
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <div aria-hidden style={{ display: "flex", gap: 4 }}>{seen.map((q) => <span key={q.id} style={{ width: 34, height: 6, borderRadius: 3, background: sent[q.id] ? C.navy : C.accent, transition: "background .3s" }} />)}</div>
                <span style={{ fontSize: 13, color: C.text }}><b>{answered}</b> of {seen.length} answered</span>
                <span style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>⌘ or Ctrl + Enter sends</span>
              </div>
            )}

            {seen.map((q, k) => {
              const s = sent[q.id];
              if (s) return (
                <article key={q.id} className="qcard rise" style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}`, background: "#fff" }}>
                  <div className="qrail" style={{ background: C.soft, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={label}>{s.dropped ? "Dropped" : "Sent"}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Glyph kind={q.kind} size={18} /><b style={{ font: `800 14px ${HEAD}` }}>#{q.num}</b></div>
                  </div>
                  <div style={{ padding: "14px 24px", display: "grid", gap: 4, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>{q.review?.question}</div>
                    <div style={{ fontSize: 14.5, lineHeight: 1.5 }}>{s.dropped ? "You took this piece off the board. The team stops work on it." : <>&ldquo;{s.text}&rdquo;</>}</div>
                    {s.dropped && <button style={{ ...link, justifySelf: "start", fontSize: 13 }} disabled={busy} onClick={() => restoreQ(q)}>Undo, bring it back</button>}
                  </div>
                </article>
              );
              const text = answers[q.id] ?? "";
              const sibs = seen.filter((x) => x.id !== q.id && x.episode_id === q.episode_id && !sent[x.id]);
              const extra = picked(q).filter((x) => !sent[x]).length;
              const why = q.review?.checks.find((c) => c.id === "owner" && !c.pass)?.note || q.review?.headline;
              const now = current === q.id;
              return (
                <article key={q.id} className="qcard rise" style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${now ? C.navy : C.line}`, background: "#fff", boxShadow: now ? "0 18px 40px rgba(11,27,39,.12)" : "none" }}>
                  <div className="qrail" style={{ background: C.navy, color: "#fff", padding: "20px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ font: `800 56px/0.85 ${HEAD}`, letterSpacing: "-0.05em", color: C.accent }}>{String(k + 1).padStart(2, "0")}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Glyph kind={q.kind} light size={20} /><b style={{ font: `800 15px ${HEAD}` }}>#{q.num}</b></div>
                    <div style={{ fontSize: 12, color: C.onNavy, lineHeight: 1.4 }}>{kindName(q, isAnimated(q))}{q.review ? <><br />{VERDICT[q.review.verdict].label} · {q.review.score}</> : null}</div>
                  </div>
                  <div style={{ padding: "20px 24px 22px", display: "grid", gap: 14, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.4 }}><b style={{ color: C.ink }}>{q.title}</b>{q.studio_episodes ? ` · from ${q.studio_episodes.title}` : ""}{stageLine(q) ? ` · ${stageLine(q)}` : ""}</div>
                    <h2 style={{ margin: 0, font: `700 23px/1.32 ${HEAD}`, letterSpacing: "-0.015em", color: C.ink }}>{q.review?.question}</h2>
                    {why && <p style={{ margin: 0, fontSize: 14, color: C.text, lineHeight: 1.5 }}><b style={{ color: C.ink }}>Why {COACH} is asking:</b> {why}</p>}
                    <textarea
                      ref={(el) => { boxes.current[q.id] = el; }}
                      aria-label={`Your answer for #${q.num}`}
                      value={text}
                      onChange={(e) => setA(q.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); answerQ(q); } }}
                      rows={4}
                      placeholder="Say it the way you would on a call."
                      style={area}
                    />
                    {sibs.length > 0 && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                        <span style={{ color: C.text, fontWeight: 600 }}>Also use this answer for</span>
                        {sibs.map((x) => {
                          const on = picked(q).includes(x.id);
                          return <label key={x.id} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer", minHeight: 32 }}><input type="checkbox" checked={on} onChange={() => toggleAlso(q, x.id)} /> #{x.num} {x.title.length > 40 ? `${x.title.slice(0, 40)}…` : x.title}</label>;
                        })}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <Dictate value={text} onChange={(v) => setA(q.id, v)} />
                      <button style={link} onClick={() => setPeek(peek === q.id ? null : q.id)}>{peek === q.id ? "Hide the piece" : "See the piece"}</button>
                      <span style={{ flex: 1 }} />
                      {dropping === q.id ? (
                        <>
                          <span style={{ fontSize: 13, color: C.text }}>Take #{q.num} off the board? The team stops all work on it.</span>
                          <button style={btn} onClick={() => setDropping(null)}>No, keep it</button>
                          <button style={{ ...link, color: C.warn }} disabled={busy} onClick={() => { if (Date.now() - dropAt.current > 700) dropQ(q); }}>Yes, take it off</button>
                        </>
                      ) : (
                        <>
                          <button style={{ ...link, color: C.muted, marginRight: 24 }} onClick={() => askDrop(q.id)}>Take this piece off the board</button>
                          <button style={now ? hot : btn} disabled={busy || !text.trim()} onClick={() => answerQ(q)}>{busy && now ? "Sending…" : extra ? `Send my answer (${extra + 1} pieces)` : "Send my answer"}</button>
                        </>
                      )}
                    </div>
                    {peek === q.id && <div className="rise" style={{ display: "flex", justifyContent: "center", padding: 16, background: C.soft, borderRadius: 6 }}><Preview p={q} width={380} /></div>}
                  </div>
                </article>
              );
            })}

            {seen.length > 0 && answered === seen.length && (
              <div className="rise" style={{ background: C.navy, color: "#fff", borderRadius: 6, padding: "22px 24px", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                <Glyph kind="coach" light size={30} />
                <div style={{ flex: "1 1 320px" }}>
                  <div style={{ font: `800 22px ${HEAD}` }}>The team has your answers.</div>
                  <div style={{ fontSize: 14, color: "#c0ccd6", marginTop: 4, lineHeight: 1.5 }}>They work your words into each piece, and {COACH} checks it again before it comes back to you.</div>
                </div>
                {d.pieces.length > 0 && <button style={hot} onClick={() => go("pieces")}>{plural(d.pieces.length, "piece", "pieces")} to approve</button>}
              </div>
            )}
            {!seen.length && (
              <div style={{ ...card, padding: 28 }}>
                <h2 style={{ margin: 0, font: `800 22px ${HEAD}` }}>No questions.</h2>
                <p style={{ color: C.text, margin: "6px 0 0", lineHeight: 1.5 }}>{COACH} had what it needed on every piece. When it can&apos;t write your take without you, the question lands here.</p>
              </div>
            )}
          </div>
        )}

        {tab === "pieces" && d && !p && (
          <div style={{ ...card, padding: 28 }}>
            <h2 style={{ margin: 0, font: `800 22px ${HEAD}` }}>You&apos;re clear.</h2>
            {asks > 0 && (
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", margin: "16px 0 6px", padding: "16px 18px", borderRadius: 6, border: `1.5px solid ${C.accent}` }}>
                <span style={{ flex: "1 1 260px", font: `700 16px/1.4 ${HEAD}` }}>{COACH} has {plural(asks, "question", "questions")} only you can answer.</span>
                <button style={hot} onClick={() => go("questions")}>Answer {asks === 1 ? "it" : "them"}</button>
              </div>
            )}
            <p style={{ color: C.text, margin: "14px 0 18px" }}>{COACH} is holding these with the team until they&apos;re fixed:</p>
            <div style={{ display: "grid", gap: 8 }}>
              {d.held.map((h) => (
                <a key={h.id} href={`/episodes/${h.episode_id}?piece=${h.id}`} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 6, border: `1px solid ${C.line}`, color: C.ink, textDecoration: "none" }}>
                  <Glyph kind={h.kind} /> <b>#{h.num}</b> <span style={{ flex: 1 }}>{h.title}</span>
                  {stageLine(h) && <span style={stageText}>{stageLine(h)}</span>}
                  {h.review ? <span style={chip(VERDICT[h.review.verdict])}>{VERDICT[h.review.verdict].label} · {h.review.score}</span> : <span style={chip(STATUS[h.status] ?? STATUS.draft)}>{h.status === "changes" ? "Sent back" : "Not reviewed"}</span>}
                </a>
              ))}
              {!d.held.length && <p style={{ margin: 0, color: C.muted }}>Nothing. The team has a clean board.</p>}
            </div>
          </div>
        )}
        {tab === "pieces" && p && (
          <div className="grid-queue" key={p.id}>
            <section className="rise" style={{ ...card, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Glyph kind={p.kind} size={24} />
                <span style={{ font: `800 22px ${HEAD}` }}>#{p.num}</span>
                <span style={{ ...label }}>{kindName(p, isAnimated(p))}</span>
                <span style={{ marginLeft: "auto", fontSize: 13, color: C.muted, display: "flex", gap: 8, alignItems: "center" }}>
                  {p.scheduled_at ? slotStamp(p.scheduled_at) : "No date yet"} <Channels list={p.channels} />
                </span>
              </div>
              <div>
                <h2 style={{ margin: 0, font: `800 26px/1.15 ${HEAD}`, letterSpacing: "-0.02em" }}>{p.title}</h2>
                {p.studio_episodes && <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>From {p.studio_episodes.title}{p.studio_episodes.guest ? ` · guest ${p.studio_episodes.guest}` : ""}</div>}
                {stageLine(p) && <div style={{ ...stageText, marginTop: 4 }}>{stageLine(p)}</div>}
              </div>
              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}><Preview p={p} width={420} /></div>
              {p.kind !== "post" && (
                <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
                  <div style={label}>Caption</div>
                  {/* one caption on every network; a network that has its own shows below it */}
                  {p.caption ? <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{p.caption}</p> : <p style={{ margin: "6px 0 0", fontSize: 13, color: C.muted }}>No caption yet. The team adds it before it goes to {SCHEDULER_NAME}.</p>}
                  {Object.entries(ownCaptions(p.caption, p.captions)).map(([k, v]) => (
                    <details key={k} style={{ marginTop: 8 }}>
                      <summary style={{ font: `700 13px ${HEAD}` }}>{LABEL[k as Platform] ?? k} has its own</summary>
                      <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{v}</p>
                    </details>
                  ))}
                </div>
              )}
            </section>
            <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <CoachCard review={p.review} big busy={busy}
                canUse={(f) => !!f.before && !!f.after && (!!p.body?.includes(f.before) || Object.values(p.captions ?? {}).some((c) => c?.includes(f.before)) || !!p.caption?.includes(f.before))}
                onUseFix={(f) => applyFix(p, f)} />
              {!p.review && <p style={{ margin: 0, fontSize: 13, color: C.muted }}>The team sent this without a review from {COACH}.</p>}
              {p.review?.question && (
                <div style={{ ...card, padding: 16, display: "grid", gap: 10 }}>
                  <div style={label}>Your answer goes to the team</div>
                  <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} placeholder="Say it the way you would on a call. The team uses your words for your take." style={{ ...input, padding: 10, minHeight: 96, font: "14px/1.5 Poppins, Arial, sans-serif" }} />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Dictate value={answer} onChange={setAnswer} />
                    <button style={ghost} disabled={!answer.trim() || busy} onClick={() => decide("answer", { note: answer })}>Send my answer to the team</button>
                  </div>
                </div>
              )}
              {d && d.pieces.length > 1 && (
                <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: C.muted }}>
                  <button style={link} disabled={i === 0} onClick={() => { reset(); setI(i - 1); }}>Previous</button>
                  Piece {i + 1} of {d.pieces.length}
                  <button style={link} disabled={i >= d.pieces.length - 1} onClick={() => { reset(); setI(i + 1); }}>Next</button>
                </div>
              )}
              {asks > 0 && <button style={{ ...link, alignSelf: "start" }} onClick={() => go("questions")}>{COACH} also has {plural(asks, "question", "questions")} for you</button>}
            </section>
          </div>
        )}
      </main>

      {tab === "pieces" && p && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: `1px solid ${C.line}`, boxShadow: "0 -10px 30px rgba(11,27,39,.08)", zIndex: 15 }}>
          <div className="qbar" style={{ maxWidth: 1300, margin: "0 auto", padding: "14px 28px calc(14px + env(safe-area-inset-bottom))", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            {mode === "idle" ? (
              <>
                <span className="qtitle" style={{ fontSize: 14, color: past(p) ? C.warn : C.text, flex: "1 1 240px" }}><b>#{p.num}</b> {past(p) ? `Its date, ${slotStamp(p.scheduled_at!)}, has passed.` : p.title}</span>
                <button className="qback" style={{ ...ghost, minHeight: 52, padding: "0 22px" }} disabled={busy} onClick={() => setMode("back")}>Send back</button>
                {past(p) ? <button className="qok" style={hot} disabled={busy} onClick={() => setSheet(p)}>Pick a new date</button> : <button className="qok" style={hot} disabled={busy} onClick={approve}>{dated(p) ? `Approve and schedule for ${new Date(p.scheduled_at!).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}` : "Approve"}</button>}
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {REASONS.map((r) => <button key={r} onClick={() => setReasons(reasons.includes(r) ? reasons.filter((x) => x !== r) : [...reasons, r])} style={{ ...chip(reasons.includes(r) ? { label: r, bg: C.navy, fg: "#fff" } : { label: r, bg: "#fff", fg: C.ink, border: `1px solid ${C.hair}` }), minHeight: 34, padding: "0 12px", fontSize: 12, cursor: "pointer" }}>{r}</button>)}
                </div>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change?" style={{ ...input, flex: "1 1 260px", width: "auto" }} />
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={rule} onChange={(e) => setRule(e.target.checked)} /> Make this a rule for {COACH}</label>
                <button style={btn} disabled={busy || (!note.trim() && !reasons.length)} onClick={() => decide("sendback", { note, reasons, rule })}>Send it back</button>
                <button style={link} onClick={reset}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}
      {sheet && <PieceSheet piece={sheet} isOwner={isOwner} onClose={() => setSheet(null)} onChanged={load} />}
    </>
  );
}
