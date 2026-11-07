"use client";
import { useEffect, useState } from "react";
import Glyph from "../components/Glyph";
import { C, HEAD, CHECKS, btn, ghost, card, label, input, chip } from "../../lib/ui";
import { OWNER, COACH, DOC } from "../../lib/brand";

type Rule = { id: string; body: string; status: string; author: string; created_at: string; studio_pieces: { num: number; title: string } | null };

export default function Coach() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [stats, setStats] = useState<{ agree: number; total: number } | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const load = async () => {
    const [r, q] = await Promise.all([fetch("/api/rules").then((x) => x.json()), fetch("/api/queue").then((x) => x.json())]);
    if (r.error) setErr(r.error); else setRules(r.rules);
    if (q.stats) setStats(q.stats);
  };
  useEffect(() => { load(); }, []);
  const send = async (method: string, body: unknown) => {
    const r = await fetch("/api/rules", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json());
    if (r.error) setErr(r.error);
    load();
  };

  return (
    <>
      <section style={{ background: C.navy, color: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "34px 28px", display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 76, height: 76, borderRadius: 18, background: C.navy2, display: "grid", placeItems: "center", flex: "none" }}><Glyph kind="coach" light size={44} /></div>
          <div style={{ flex: "1 1 420px" }}>
            <h1 style={{ margin: 0, font: `800 38px/1.1 ${HEAD}`, letterSpacing: "-0.03em" }}>{COACH}</h1>
            <p style={{ margin: "8px 0 0", fontSize: 16, lineHeight: 1.5, color: "#d5dee5", maxWidth: 680 }}>Every piece gets checked against {OWNER}&apos;s standard before {OWNER} sees it. {COACH} knows {OWNER}&apos;s voice, offers and audience from the second brain, and it learns from every piece {OWNER} sends back.</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ font: `800 46px/1 ${HEAD}`, color: C.accent, letterSpacing: "-0.04em" }}>{stats?.total ? `${Math.round((stats.agree / stats.total) * 100)}%` : "New"}</div>
            <div style={{ fontSize: 12, color: C.onNavy, marginTop: 6 }}>{stats?.total ? `agreed with ${OWNER} on ${stats.agree} of ${stats.total} calls` : `0 send-backs from ${OWNER} yet`}</div>
          </div>
        </div>
      </section>
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "26px 28px 40px", display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section style={{ ...card, padding: 24, flex: "1 1 460px" }}>
          <div style={label}>The seven checks, in order</div>
          <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
            {CHECKS.map((c, k) => (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 12, alignItems: "start" }}>
                <span style={{ font: `800 30px/1 ${HEAD}`, color: k < 2 ? C.deep : C.ink, letterSpacing: "-0.03em" }}>{k + 1}</span>
                <div><div style={{ font: `700 16px ${HEAD}` }}>{c.label}</div><div style={{ fontSize: 14, color: C.text, marginTop: 2, lineHeight: 1.45 }}>{c.q}</div></div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: C.muted, margin: "20px 0 0", lineHeight: 1.5 }}>The first two decide whether a piece is worth {OWNER}&apos;s time. When the {OWNER} test fails, {COACH} never writes {OWNER}&apos;s opinion for them: it asks {OWNER} one question instead. The full standard lives in the second brain as &ldquo;{DOC.review}&rdquo;.</p>
        </section>
        <section style={{ ...card, padding: 24, flex: "1 1 420px" }}>
          <div style={label}>{OWNER}&apos;s rules</div>
          <p style={{ fontSize: 14, color: C.text, margin: "8px 0 14px", lineHeight: 1.5 }}>When {OWNER} sends something back and ticks &ldquo;make this a rule&rdquo;, it lands here and goes into every review from then on.</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Never open a post with the guest's name" style={{ ...input, flex: "1 1 240px", width: "auto" }} />
            <button style={btn} disabled={!text.trim()} onClick={() => { send("POST", { body: text }); setText(""); }}>Add rule</button>
          </div>
          {err && <p style={{ color: C.warn }}>{err}</p>}
          <div style={{ display: "grid", gap: 10 }}>
            {rules.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: `1px solid ${C.line}`, opacity: r.status === "off" ? 0.5 : 1 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, lineHeight: 1.45 }}>{r.body}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{r.author} · {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{r.studio_pieces ? ` · from #${r.studio_pieces.num} ${r.studio_pieces.title}` : ""}</div>
                </div>
                <span style={chip(r.status === "active" ? { label: "", bg: C.navy, fg: "#fff" } : { label: "", bg: C.soft, fg: C.muted })}>{r.status === "active" ? "On" : "Off"}</span>
                <button style={{ ...ghost, minHeight: 30, padding: "0 10px", fontSize: 12 }} onClick={() => send("PATCH", { id: r.id, status: r.status === "active" ? "off" : "active" })}>{r.status === "active" ? "Turn off" : "Turn on"}</button>
              </div>
            ))}
            {!rules.length && <p style={{ margin: 0, fontSize: 14, color: C.muted }}>No rules yet. They start with {OWNER}&apos;s first send-back.</p>}
          </div>
        </section>
      </main>
    </>
  );
}
