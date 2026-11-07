"use client";
import { useEffect, useState } from "react";
import { C, HEAD, ghost, label, input, link } from "../../lib/ui";
import { LABEL, LIMIT, PLATFORM, bodyOf, channelsFor, ctaNote, fitCaption, ownCaptions, paras, platformsFor, withEnding, type LeadMagnet, type Platform } from "../../lib/platforms";
import { TAG_IN_TEXT, tagGuest, type Guest } from "../../lib/guests";
import { COACH, SCHEDULER_NAME } from "../../lib/brand";
import { FEED_HANDLE } from "./Preview";

const FOLD = 125;   // Instagram shows about this much before "more"
const SYS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const area = { ...input, padding: 10, minHeight: 140, font: "14px/1.5 Poppins, Arial, sans-serif", resize: "vertical" as const };

type Captions = Partial<Record<Platform, string>>;
type Props = {
  kind: string; channels: string[]; captions: Captions; fallback: string; leadMagnetId: string | null; busy?: boolean; writing?: boolean; guest?: Guest;
  onSave: (own: Captions, shared: string) => void; onWrite: () => void; onLeadMagnet: (id: string | null) => void; onChannels: (channels: string[]) => void;
};

// The caption that goes out with a reel or carousel: one caption on every network, shortened where a
// network's limit is tighter, and a network gets its own only when someone writes one. The lead magnet picked here
// decides the call to action.
export default function Caption({ kind, channels, captions, fallback, leadMagnetId, busy, writing, guest, onSave, onWrite, onLeadMagnet, onChannels }: Props) {
  const nets = platformsFor(kind, channels);
  const [shared, setShared] = useState(fallback ?? "");
  const [own, setOwn] = useState<Captions>(() => ownCaptions(fallback, captions));
  const [tab, setTab] = useState<Platform | "all">("all");
  const [lms, setLms] = useState<LeadMagnet[]>([]);
  useEffect(() => { setShared(fallback ?? ""); setOwn(ownCaptions(fallback, captions)); }, [JSON.stringify(captions), fallback]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab !== "all" && !nets.includes(tab)) setTab("all"); }, [nets.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetch("/api/lead-magnets").then((r) => r.json()).then((r) => setLms((r.leadMagnets ?? []).filter((x: LeadMagnet) => x.active))).catch(() => {}); }, []);
  const lm = lms.find((x) => x.id === leadMagnetId) ?? null;
  const dirty = shared !== (fallback ?? "") || JSON.stringify(own) !== JSON.stringify(ownCaptions(fallback, captions));
  const save = (o: Captions = own, s: string = shared) => {
    if (busy) return;
    // a network whose caption is the shared one with its own next step keeps following the shared one
    const was = bodyOf(fallback);
    const next = s !== (fallback ?? "") && was
      ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && bodyOf(v) === was ? withEnding(s, paras(v).slice(-1)[0]) : v])) as Captions
      : o;
    if (next !== o) setOwn(next);
    onSave(next, s);
  };
  const any = !!shared.trim() || Object.keys(own).length > 0;
  const write = () => { if (!any || window.confirm("Replace the caption with a new draft?")) onWrite(); };
  // where each network stands: its own words, the shared caption shortened, or the shared caption as it is
  const state = (n: Platform) => (own[n] ? "own" : shared.trim().length > LIMIT[n] ? "short" : "same");
  const chip = (on: boolean) => ({ minHeight: 34, padding: "0 12px", borderRadius: 6, cursor: "pointer", font: `600 13px ${HEAD}`, border: `1px solid ${on ? C.navy : C.hair}`, background: on ? C.navy : "#fff", color: on ? "#fff" : C.ink });
  const n = tab === "all" ? null : tab;
  // what Instagram shows, with the guest tagged the way it's sent
  const igText = tagGuest(shared, guest, "instagram");
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={label}>Caption</span>
        <span style={{ fontSize: 12, color: C.muted }}>The same on every network unless one gets its own</span>
      </div>
      {writing && <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>The writer is drafting this caption with the LinkedIn skill, then {COACH} gives it a first look. It shows here in a minute or two.</div>}
      <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
        <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>Lead magnet <a href="/leads" style={{ ...link, marginLeft: "auto", fontSize: 12 }}>See all lead magnets</a></span>
        <select value={leadMagnetId ?? ""} onChange={(e) => onLeadMagnet(e.target.value || null)} style={{ ...input, fontWeight: 400 }}>
          <option value="">None: the next step is the full episode or the link</option>
          {lms.map((x) => <option key={x.id} value={x.id}>{x.keyword} · {x.name}</option>)}
        </select>
      </label>
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Goes out on</span>
        <div style={{ display: "flex", gap: "6px 14px", flexWrap: "wrap", fontSize: 13.5 }}>
          {channelsFor(kind).map((c, _, all) => {
            const on = nets.includes(PLATFORM[c]);
            // never greyed out while something else on the page is busy: a tick saves on its own (LinkedIn once looked unselectable)
            return <label key={c} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={on} disabled={on && nets.length === 1} onChange={() => onChannels(on ? all.filter((x) => x !== c && nets.includes(PLATFORM[x])) : all.filter((x) => x === c || nets.includes(PLATFORM[x])))} /> {c}</label>;
          })}
        </div>
      </div>
      <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button role="tab" aria-selected={tab === "all"} onClick={() => { if (dirty) save(); setTab("all"); }} style={chip(tab === "all")}>Every network</button>
        {nets.map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} onClick={() => { if (dirty) save(); setTab(x); }} style={chip(tab === x)}>
            {LABEL[x]}{state(x) === "own" ? " · own" : state(x) === "short" ? " · shortened" : ""}{own[x] && own[x]!.length > LIMIT[x] ? " · too long" : ""}
          </button>
        ))}
      </div>

      {!n && (
        <>
          <textarea value={shared} readOnly={writing} onChange={(e) => setShared(e.target.value)} onBlur={() => { if (dirty) save(); }} rows={7} placeholder="The words that go out with it on every network. Write them, or let the writer draft them from what's said." style={area} />
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>
            {shared.length.toLocaleString()} characters.{nets.filter((x) => !own[x] && shared.trim().length > LIMIT[x]).map((x) => ` ${LABEL[x]} takes ${LIMIT[x].toLocaleString()}, so it gets a shorter cut (open its tab to see it).`).join("")}
            {Object.keys(own).length > 0 && ` Own caption on ${Object.keys(own).map((x) => LABEL[x as Platform]).join(", ")}.`}
          </div>
          {nets.includes("instagram") && !own.instagram && shared.trim() && (
            <div style={{ padding: "10px 12px", borderRadius: 6, background: C.soft, font: `13px/1.45 ${SYS}`, color: "#262626", whiteSpace: "pre-wrap" }}>
              <div style={{ font: `700 11px ${HEAD}`, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>What shows on Instagram before &ldquo;more&rdquo;</div>
              <b>{FEED_HANDLE}</b> {igText.length > FOLD ? <>{igText.slice(0, FOLD).trimEnd()}&hellip; <span style={{ color: "#737373" }}>more</span></> : igText}
            </div>
          )}
        </>
      )}

      {n && (
        <>
          <div style={{ fontSize: 12.5, color: C.text }}>{ctaNote(lm, n)}.</div>
          {/* tagging the guest (lib/guests.ts): the @handle goes in on send, so the words here stay as written */}
          {guest?.name && (TAG_IN_TEXT.includes(n) && guest.handles[n]
            ? <div style={{ fontSize: 12.5, color: C.text }}>{guest.handles[n]} goes in where it first names {guest.name}, when it&apos;s sent.</div>
            : n === "linkedin" ? <div style={{ fontSize: 12.5, color: C.text }}>Tag {guest.name} by hand on LinkedIn, in {SCHEDULER_NAME} before it posts or on LinkedIn after. The app can&apos;t tag there.</div>
            : TAG_IN_TEXT.includes(n) ? <div style={{ fontSize: 12.5, color: C.muted }}>No {LABEL[n]} handle for {guest.name} on the episode, so no tag.</div> : null)}
          {own[n] !== undefined ? (
            <>
              <textarea value={own[n]} onChange={(e) => setOwn({ ...own, [n]: e.target.value })} onBlur={() => { if (dirty) save(); }} rows={7} style={area} />
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontSize: 12, color: own[n]!.length > LIMIT[n] ? C.warn : C.muted }}>{own[n]!.length.toLocaleString()} / {LIMIT[n].toLocaleString()} on {LABEL[n]}</span>
                <button style={{ ...link, fontSize: 12.5 }} onClick={() => { const o = { ...own }; delete o[n]; setOwn(o); save(o); }}>Use the shared caption again</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: "10px 12px", borderRadius: 6, background: C.soft, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", color: shared.trim() ? C.ink : C.muted }}>{fitCaption(tagGuest(shared, guest, n), LIMIT[n]) || "No caption yet."}</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontSize: 12, color: C.muted }}>{state(n) === "short" ? `The shared caption, shortened to fit ${LABEL[n]}'s ${LIMIT[n].toLocaleString()} characters: the first and last paragraphs stay, and the middle ones that fit.` : `The shared caption, as it goes out on ${LABEL[n]}.`}</span>
                <button style={{ ...link, fontSize: 12.5 }} onClick={() => setOwn({ ...own, [n]: fitCaption(shared, LIMIT[n]) })}>Write a different one for {LABEL[n]}</button>
              </div>
            </>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {dirty && <span style={{ alignSelf: "center", fontSize: 12, color: C.muted }}>Saves when you click away</span>}
        <button style={ghost} disabled={busy || writing} onClick={write}>{any ? "Write a new draft" : "Write it for me"}</button>
      </div>
    </div>
  );
}
