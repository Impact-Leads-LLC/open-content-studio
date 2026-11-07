"use client";
import { useEffect, useState } from "react";
import { C, HEAD, btn, ghost, link, card, label, input } from "../../lib/ui";
import { LABEL, type LeadMagnet, type Platform } from "../../lib/platforms";
import { OWNER, WEBSITE } from "../../lib/brand";

// The lead magnets a post can point to, and where each one's follow-through goes: the ManyChat automation per network,
// the page people land on, the CRM form. Read from ManyChat, the CRM and the site without touching any of them; the
// team keeps it current here.
const NETS: Platform[] = ["instagram", "facebook", "tiktok"];
const blank = { name: "", keyword: "", offer: "", link: "", crm: "", notes: "", manychat: {} as LeadMagnet["manychat"], active: true };

export default function Leads() {
  const [list, setList] = useState<LeadMagnet[]>([]);
  const [edit, setEdit] = useState<(Partial<LeadMagnet> & typeof blank) | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/lead-magnets").then((r) => r.json()).then((r) => (r.error ? setErr(r.error) : setList(r.leadMagnets ?? []))).catch(() => setErr("Network error."));
  useEffect(() => { load(); }, []);
  async function save() {
    if (!edit) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/lead-magnets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(edit) }).then((x) => x.json()).catch(() => ({ error: "Network error." }));
    setBusy(false);
    if (r.error) return setErr(r.error);
    setEdit(null); load();
  }
  const net = (lm: Partial<LeadMagnet>, p: Platform) => lm.manychat?.[p];
  const setNet = (p: Platform, v: { live?: boolean; how?: string }) => edit && setEdit({ ...edit, manychat: { ...edit.manychat, [p]: { ...edit.manychat?.[p], ...v } } });
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 48px", display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, font: `800 30px/1.15 ${HEAD}`, letterSpacing: "-0.025em" }}>Lead magnets</h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: C.text, maxWidth: 680, lineHeight: 1.5 }}>Pick one on a reel or carousel and the captions ask for the keyword the right way on each network: comment on Instagram and Facebook, DM on TikTok, comment on LinkedIn and Threads ({OWNER} sends those by hand). Where ManyChat isn&apos;t set up for a network, the caption points to the link instead.</p>
        </div>
        {!edit && <button style={btn} onClick={() => setEdit({ ...blank })}>Add a lead magnet</button>}
      </div>
      {err && <div style={{ ...card, padding: "10px 14px", color: C.warn, fontSize: 14 }}>{err}</div>}

      {edit && (
        <section className="rise" style={{ ...card, padding: 20, display: "grid", gap: 12 }}>
          <div style={label}>{edit.id ? `Edit ${edit.keyword}` : "New lead magnet"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 12 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={input} /></label>
            <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>Keyword<input value={edit.keyword} onChange={(e) => setEdit({ ...edit, keyword: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} style={{ ...input, fontFamily: HEAD, fontWeight: 700 }} /></label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>What people get<input value={edit.offer ?? ""} onChange={(e) => setEdit({ ...edit, offer: e.target.value })} style={input} /></label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>Link<input value={edit.link ?? ""} onChange={(e) => setEdit({ ...edit, link: e.target.value })} placeholder={`${(WEBSITE || "https://example.com").replace(/\/+$/, "")}/...`} style={input} /></label>
          <div style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>ManyChat automation live for this keyword on</span>
            {NETS.map((p) => (
              <div key={p} style={{ display: "grid", gridTemplateColumns: "140px minmax(0,1fr)", gap: 10, alignItems: "center" }}>
                <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={!!net(edit, p)?.live} onChange={(e) => setNet(p, { live: e.target.checked })} /> {LABEL[p]}</label>
                <input value={net(edit, p)?.how ?? ""} onChange={(e) => setNet(p, { how: e.target.value })} placeholder="What the automation does" style={{ ...input, minHeight: 38, fontSize: 13 }} />
              </div>
            ))}
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>CRM<input value={edit.crm ?? ""} onChange={(e) => setEdit({ ...edit, crm: e.target.value })} placeholder="The CRM form and tags it lands on" style={input} /></label>
          <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>Notes<input value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} style={input} /></label>
          <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> In use (shows in the picker)</label>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button style={btn} disabled={busy || !edit.name.trim() || !edit.keyword} onClick={save}>{busy ? "Saving…" : "Save"}</button>
            <button style={link} onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </section>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {list.map((lm) => (
          <article key={lm.id} style={{ ...card, padding: 20, display: "grid", gap: 12, opacity: lm.active ? 1 : 0.55 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ font: `800 24px ${HEAD}`, letterSpacing: "-0.02em" }}>{lm.keyword}</span>
              <b style={{ font: `700 16px ${HEAD}` }}>{lm.name}</b>
              {!lm.active && <span style={{ fontSize: 12, color: C.muted }}>not in use</span>}
              <button style={{ ...ghost, marginLeft: "auto", minHeight: 36 }} onClick={() => setEdit({ ...blank, ...lm, offer: lm.offer ?? "", link: lm.link ?? "", crm: lm.crm ?? "", notes: lm.notes ?? "" })}>Edit</button>
            </div>
            {lm.offer && <p style={{ margin: 0, fontSize: 14, color: C.text, lineHeight: 1.5 }}>{lm.offer}</p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {NETS.map((p) => {
                const m = lm.manychat?.[p];
                return (
                  <div key={p} style={{ padding: "10px 12px", borderRadius: 6, background: C.soft, display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", font: `700 13px ${HEAD}` }}>{LABEL[p]}<span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: m?.live ? C.navy : C.muted }}>{m?.live ? "ManyChat live" : "No automation"}</span></div>
                    {m?.how && <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>{m.how}</div>}
                  </div>
                );
              })}
              <div style={{ padding: "10px 12px", borderRadius: 6, background: C.soft, display: "grid", gap: 4 }}>
                <div style={{ font: `700 13px ${HEAD}` }}>LinkedIn and Threads</div>
                <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>People comment {lm.keyword}; {OWNER} sends it by hand for now.</div>
              </div>
            </div>
            <div style={{ display: "grid", gap: 4, fontSize: 13, color: C.text }}>
              {lm.link && <div><b>Page:</b> <a href={lm.link} target="_blank" rel="noreferrer" style={{ color: C.deep }}>{lm.link.replace(/^https?:\/\//, "")}</a></div>}
              {lm.crm && <div><b>CRM:</b> {lm.crm}</div>}
              {lm.notes && <div style={{ color: C.muted }}>{lm.notes}</div>}
              {lm.verified_at && <div style={{ fontSize: 12, color: C.muted }}>Checked against ManyChat, the CRM and the site on {new Date(lm.verified_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.</div>}
            </div>
          </article>
        ))}
        {!list.length && !err && <p style={{ color: C.muted }}>No lead magnets yet.</p>}
      </div>
    </main>
  );
}
