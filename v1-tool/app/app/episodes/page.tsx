"use client";
import { useEffect, useState } from "react";
import { C, HEAD, GROUPS, groupOf, btn, ghost, link, card, label, input, chip, type Group } from "../../lib/ui";
import { DOCX, docxParagraphs, asTranscript } from "../../lib/docx";
import { OWNER } from "../../lib/brand";

type Ep = { id: string; title: string; guest: string | null; show: string; kind?: string | null; created_at: string; archived_at: string | null; bytes: number; studio_pieces: { status: string; kind: string }[] };

const gb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

// Where an episode stands, in the four groups: nothing touched yet, still being made, all used, footage gone to Drive.
function tally(e: Ep) {
  const n: Record<Group, number> = { unreviewed: 0, edit: 0, scheduled: 0, killed: 0 };
  for (const p of e.studio_pieces ?? []) n[groupOf(p.status)]++;
  const total = (e.studio_pieces ?? []).length;
  const waiting = (e.studio_pieces ?? []).filter((p) => p.status === "ready").length;
  const used = total > 0 && n.unreviewed === 0 && n.edit === 0;
  return { n, total, waiting, used };
}

export default function Episodes() {
  const [eps, setEps] = useState<Ep[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [guest, setGuest] = useState("");
  // A standalone idea (no video): its title, its text (pasted, or read from a .txt or Word file), and how it's going.
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaText, setIdeaText] = useState("");
  const [ideaFile, setIdeaFile] = useState("");
  const [ideaBusy, setIdeaBusy] = useState("");
  const [ideaFail, setIdeaFail] = useState<{ id: string; error: string } | null>(null);
  // Fill from the training material (lib/brainidea.ts): an optional topic, and how it's going
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainTopic, setBrainTopic] = useState("");
  const [brainBusy, setBrainBusy] = useState("");
  // the calendar's "Fill them from the training material" link opens the form
  useEffect(() => { if (window.location.hash === "#brain") setBrainOpen(true); }, []);

  useEffect(() => {
    fetch("/api/episodes").then((x) => x.json()).then((r) => (r.error ? setErr(r.error) : setEps(r.episodes)));
    if (new URLSearchParams(window.location.search).get("new")) setOpen(true);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/episodes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, guest }) }).then((x) => x.json());
    if (r.error) return setErr(r.error);
    location.href = `/episodes/${r.episode.id}`;
  }

  // A Word file becomes plain text in the browser (lib/docx.ts); one with time stamps keeps its speakers and times.
  async function readIdea(f: globalThis.File | undefined) {
    if (!f) return;
    setErr("");
    try {
      let t: string;
      if (DOCX.test(f.name)) {
        const paras = await docxParagraphs(f);
        t = paras.some((p) => /\[(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?\]/.test(p)) ? asTranscript(paras) : paras.join("\n\n");
      } else t = await f.text();
      if (!t.trim()) throw new Error(`No text found in ${f.name}.`);
      setIdeaText(t.trim());
      setIdeaFile(f.name);
      if (!ideaTitle.trim()) setIdeaTitle(f.name.replace(/\.[^.]+$/, "").replace(/^\d+-/, "").replace(/[-_]+/g, " ").trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  // Gather a topic from the training material as an idea; its carousels and posts are found in the background.
  async function fromBrain(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBrainBusy(`Gathering ${brainTopic.trim() ? `"${brainTopic.trim()}"` : "a fresh topic"} from your training material (a minute or two)…`);
    const r = await fetch("/api/ideas/brain", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: brainTopic }) }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
    setBrainBusy("");
    if (r.error) return setErr(r.error);
    location.href = `/episodes/${r.episode.id}`;
  }

  // Save the idea, then the Moment Coach finds its pieces (the same engine as an episode), then open it.
  async function startIdea(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setIdeaFail(null); setIdeaBusy("Saving the idea…");
    const r = await fetch("/api/ideas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: ideaTitle, text: ideaText }) }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
    if (r.error) { setIdeaBusy(""); return setErr(r.error); }
    setIdeaBusy("Starting the Moment Coach on the idea…");
    const f = await fetch(`/api/episodes/${r.episode.id}/concepts`, { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
    if (f.error) { setIdeaBusy(""); return setIdeaFail({ id: r.episode.id, error: f.error }); }
    location.href = `/episodes/${r.episode.id}`;
  }

  const rows = eps.map((e) => ({ e, t: tally(e) }));
  const active = rows.filter((r) => !r.t.used), done = rows.filter((r) => r.t.used);

  const Card = ({ e, t }: (typeof rows)[number]) => (
    <a href={`/episodes/${e.id}`} className="card-h" style={{ ...card, padding: "18px 20px", textDecoration: "none", color: C.ink, display: "grid", gap: 12, border: t.used ? "2px solid #198754" : `1px solid ${C.line}` }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: `800 19px/1.25 ${HEAD}`, letterSpacing: "-0.01em" }}>{e.title}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{e.show}{e.guest ? ` · ${e.guest}` : ""} · {new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
        </div>
        {t.waiting > 0 && <span style={chip({ label: "", bg: C.accent, fg: C.accentInk })}>{t.waiting} waiting for {OWNER}</span>}
      </div>
      {t.used ? (
        <div style={{ font: `700 14px ${HEAD}`, color: "#198754" }}>All used · {t.n.scheduled} scheduled · {t.n.killed} killed</div>
      ) : t.total ? (
        <div style={{ display: "flex", gap: "6px 18px", flexWrap: "wrap", fontSize: 14 }}>
          {GROUPS.map((g) => (
            <span key={g.id} style={{ display: "inline-flex", gap: 7, alignItems: "center", color: t.n[g.id] ? C.ink : "#a3adb6" }}>
              <i style={{ width: 10, height: 10, borderRadius: 5, background: g.color, opacity: t.n[g.id] ? 1 : 0.35 }} />
              <b style={{ font: `800 15px ${HEAD}` }}>{t.n[g.id]}</b> {g.label.toLowerCase()}
            </span>
          ))}
        </div>
      ) : <div style={{ fontSize: 14, color: C.muted }}>{e.kind === "idea" ? "No pieces yet. Open it to find them." : <>No pieces yet. Add the episode&apos;s files to start.</>}</div>}
      <div style={{ fontSize: 12.5, color: C.muted, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {e.kind === "idea" ? <span>{e.show === "Training material" ? "From the training material · carousels and posts" : "No video · carousels, posts and animated reels"}</span> : e.archived_at ? <span>Footage cleared after posting</span> : e.bytes > 0 ? <span>Footage in the app · {gb(e.bytes)}{t.used ? " · ready to move to Drive" : ""}</span> : <span>No footage in the app</span>}
      </div>
    </a>
  );

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <h1 style={{ fontFamily: HEAD, fontSize: 28, margin: 0 }}>Episodes</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button style={ghost} onClick={() => { setBrainOpen(true); setIdeaOpen(false); setOpen(false); }}>From the training material</button>
          <button style={ghost} onClick={() => { setIdeaOpen(true); setOpen(false); setBrainOpen(false); }}>New idea</button>
          <button style={btn} onClick={() => { setOpen(true); setIdeaOpen(false); setBrainOpen(false); }}>New episode</button>
        </div>
      </div>
      {open && (
        <form onSubmit={create} className="rise" style={{ ...card, padding: 20, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 22 }}>
          <label style={{ flex: "2 1 280px", fontSize: 13, fontWeight: 600, display: "grid", gap: 6 }}>Title<input autoFocus style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sam Rivera: email deliverability" /></label>
          <label style={{ flex: "1 1 200px", fontSize: 13, fontWeight: 600, display: "grid", gap: 6 }}>Guest, if any<input style={input} value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Sam Rivera" /></label>
          <button style={btn} type="submit" disabled={!title.trim()}>Start it</button>
          <button type="button" style={ghost} onClick={() => setOpen(false)}>Cancel</button>
        </form>
      )}
      {brainOpen && (
        <form onSubmit={fromBrain} className="rise" style={{ ...card, padding: 20, display: "grid", gap: 14, marginBottom: 22 }}>
          <b style={{ font: `800 17px ${HEAD}` }}>Carousels and posts from the training material</b>
          <span style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>Claude picks a topic you teach that hasn&apos;t gone out lately (or the one you name), gathers your own teaching on it from the brain, and makes a carousel and a post for each of the five stages. No video needed.</span>
          <label style={{ fontSize: 13, fontWeight: 600, display: "grid", gap: 6 }}>Topic (optional)<input autoFocus style={input} value={brainTopic} disabled={!!brainBusy} placeholder="The first thing a new client should fix" onChange={(e) => setBrainTopic(e.target.value)} /></label>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" style={ghost} disabled={!!brainBusy} onClick={() => setBrainOpen(false)}>Cancel</button>
            <button style={btn} type="submit" disabled={!!brainBusy}>Make the pieces</button>
          </div>
          {brainBusy && <div className="rise" style={{ fontSize: 13.5, color: C.ink }}>{brainBusy}</div>}
        </form>
      )}
      {ideaOpen && (
        <form onSubmit={startIdea} className="rise" style={{ ...card, padding: 20, display: "grid", gap: 14, marginBottom: 22 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <b style={{ font: `800 17px ${HEAD}` }}>Start from an idea</b>
            <span style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>A voice note, a dictation or notes, with no video. The Moment Coach finds the carousels, LinkedIn posts and animated reels in it, each built for one awareness stage.</span>
          </div>
          <label style={{ fontSize: 13, fontWeight: 600, display: "grid", gap: 6 }}>Title<input autoFocus style={input} value={ideaTitle} disabled={!!ideaBusy} onChange={(e) => setIdeaTitle(e.target.value)} placeholder="Why our best clients came from referrals" /></label>
          <label style={{ fontSize: 13, fontWeight: 600, display: "grid", gap: 6 }}>The idea, as you said it
            <textarea style={{ ...input, padding: 12, minHeight: 180, font: "14px/1.55 Poppins, Arial, sans-serif", resize: "vertical" }} value={ideaText} disabled={!!ideaBusy} onChange={(e) => { setIdeaText(e.target.value); setIdeaFile(""); }} placeholder="Paste the transcript of the voice note, the dictation or the notes." />
          </label>
          <input id="idea-file" type="file" hidden accept=".txt,.srt,.vtt,.docx,text/plain" disabled={!!ideaBusy} onChange={(e) => { readIdea(e.target.files?.[0]); e.target.value = ""; }} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label htmlFor="idea-file" style={{ ...link, fontSize: 13.5 }}>Or add a .txt or Word file</label>
            {ideaFile && <span style={{ fontSize: 12.5, color: C.muted }}>Read from {ideaFile}</span>}
            <span style={{ flex: 1 }} />
            <button type="button" style={ghost} disabled={!!ideaBusy} onClick={() => { setIdeaOpen(false); setIdeaFail(null); }}>Cancel</button>
            <button style={btn} type="submit" disabled={!ideaTitle.trim() || !ideaText.trim() || !!ideaBusy}>Find the pieces</button>
          </div>
          {ideaBusy && <div className="rise" style={{ fontSize: 13.5, color: C.ink }}>{ideaBusy}</div>}
          {ideaFail && <div style={{ fontSize: 13.5, color: C.warn, lineHeight: 1.5 }}>The idea is saved, but finding its pieces didn&apos;t work: {ideaFail.error} <a href={`/episodes/${ideaFail.id}`} style={{ color: C.ink }}>Open the idea</a> and use Find the moments to try again.</div>}
        </form>
      )}
      {err && <p style={{ color: C.warn }}>{err}</p>}
      <div style={{ display: "grid", gap: 12 }}>{active.map((r) => <Card key={r.e.id} {...r} />)}</div>
      {!eps.length && !err && <p style={{ color: C.muted }}>No episodes yet.</p>}
      {done.length > 0 && (
        <>
          <div style={{ ...label, margin: "28px 0 12px" }}>Done</div>
          <div style={{ display: "grid", gap: 12 }}>{done.map((r) => <Card key={r.e.id} {...r} />)}</div>
        </>
      )}
    </main>
  );
}
