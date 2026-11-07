"use client";
import { useEffect, useState } from "react";
import { C, HEAD, ghost, hot, link, label } from "../../lib/ui";
import { LABEL, platformsFor, type Platform } from "../../lib/platforms";
import type { ViewPiece } from "../../lib/types";
import type { Guest } from "../../lib/guests";
import { OWNER, SCHEDULER_ID, SCHEDULER_NAME } from "../../lib/brand";
import PostingKit from "./PostingKit";

type Drive = { ready: boolean; name: string; drive: ViewPiece["media"]["drive"] | null };
type Conn = { configured: boolean; error?: string; workspace?: { name: string; timezone: string }; accounts?: { platform: string; name: string; status: string }[] };

// The scheduler (ContentStudio or Metricool, per install): one post per network. Drafts never publish, so anyone can
// stage them; scheduling is the owner's, once the owner has approved the piece and given it a date.
export default function SendCs(props: { p: ViewPiece; isOwner: boolean; busy: boolean; guest?: Guest; link?: string | null; onCollab?: (on: boolean) => void; onSend: (mode: "draft" | "scheduled") => void; onRefresh: () => void; onHandoff?: (undo: boolean) => void }) {
  // any other scheduler (SCHEDULER=export): the posting kit instead of sending
  if (SCHEDULER_ID === "export") return <PostingKit p={props.p} isOwner={props.isOwner} busy={props.busy} onHandoff={props.onHandoff} />;
  return <SendToScheduler {...props} />;
}

function SendToScheduler({ p, isOwner, busy, guest, link: epLink, onCollab, onSend, onRefresh }: { p: ViewPiece; isOwner: boolean; busy: boolean; guest?: Guest; link?: string | null; onCollab?: (on: boolean) => void; onSend: (mode: "draft" | "scheduled") => void; onRefresh: () => void; onHandoff?: (undo: boolean) => void }) {
  const [conn, setConn] = useState<Conn | null>(null);
  useEffect(() => { fetch("/api/scheduler").then((r) => r.json()).then(setConn).catch(() => setConn({ configured: true, error: `Couldn't reach ${SCHEDULER_NAME}.` })); }, []);
  // Google Drive: where the finished files go once it's scheduled, and what they're called
  const [drv, setDrv] = useState<Drive | null>(null);
  const [saving, setSaving] = useState(false);
  const [drvErr, setDrvErr] = useState("");
  useEffect(() => { fetch(`/api/pieces/${p.id}/drive`).then((r) => r.json()).then((r) => { if (!r.error) setDrv(r); }).catch(() => {}); }, [p.id, p.media?.drive?.at, p.media?.cs?.at, p.scheduled_at]);
  const toDrive = async () => {
    setSaving(true); setDrvErr("");
    const r = await fetch(`/api/pieces/${p.id}/drive`, { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "Network error" }));
    setSaving(false);
    if (r.error) setDrvErr(r.error);
    if (r.drive) setDrv((d) => (d ? { ...d, drive: r.drive } : d));
  };
  const nets: Platform[] = platformsFor(p.kind, p.channels, !!p.media?.image);
  const acc = (n: Platform) => conn?.accounts?.find((a) => a.platform?.toLowerCase() === n);
  const cs = p.media?.cs;
  const canSchedule = isOwner && ["approved", "scheduled"].includes(p.status) && !!p.scheduled_at;
  const scheduled = p.status === "posted" || (cs?.mode === "scheduled" && cs.results.some((r) => r.ok));
  const saved = drv?.drive && !drv.drive.error ? drv.drive : null;
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={label}>{SCHEDULER_NAME}</span>
        {conn?.workspace && <span style={{ fontSize: 12, color: C.muted }}>{conn.workspace.name}{conn.workspace.timezone ? ` · ${conn.workspace.timezone}` : ""}</span>}
      </div>
      {!conn ? <span style={{ fontSize: 13, color: C.muted }}>Checking the connection…</span>
        : !conn.configured ? <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.5 }}>Not connected yet. The {SCHEDULER_NAME} keys go in the Vercel project settings; then every piece can go over from here.</p>
        : conn.error ? <p style={{ margin: 0, fontSize: 13, color: C.warn, lineHeight: 1.5 }}>{conn.error}</p>
        : (
          <>
            <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
              {nets.map((n) => (
                <div key={n} style={{ display: "flex", gap: 8 }}><b style={{ minWidth: 86, fontFamily: HEAD }}>{LABEL[n]}</b><span style={{ color: acc(n) ? C.text : C.warn }}>{acc(n)?.name || (acc(n) ? "connected" : `no account connected in ${SCHEDULER_NAME}`)}</span></div>
              ))}
            </div>
            {/* the guest and the link: an Instagram co-author invite, LinkedIn tags by hand, the link as the first comment */}
            {(() => {
              const ig = guest?.handles.instagram && nets.includes("instagram") && ["reel", "carousel"].includes(p.kind) ? guest.handles.instagram : "";
              const comments = nets.filter((n) => n === "linkedin" || n === "facebook");
              const lines = [
                guest?.name && nets.includes("linkedin") ? <span key="li">LinkedIn: tag {guest.name} by hand, in {SCHEDULER_NAME} before it posts or on LinkedIn after{guest.handles.linkedin ? <> (<a href={guest.handles.linkedin} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 12.5 }}>profile</a>)</> : ""}.</span> : null,
                comments.length ? <span key="fc" style={{ color: epLink ? C.text : C.warn }}>{epLink ? `The episode link goes in the first comment on ${comments.map((n) => LABEL[n]).join(" and ")} where the caption points there.` : "No episode link yet, so no first comment. Add it under Guest and links on the episode before scheduling."}</span> : null,
              ].filter(Boolean);
              if (!ig && !lines.length) return null;
              return (
                <div style={{ display: "grid", gap: 6, fontSize: 12.5, lineHeight: 1.45, color: C.text }}>
                  {ig && <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}><input type="checkbox" checked={!p.media?.no_collab} disabled={busy || !onCollab} onChange={(e) => onCollab?.(e.target.checked)} style={{ marginTop: 2 }} /> <span>Invite {ig} as a collaborator on Instagram. Once they accept, it shows on their profile too.</span></label>}
                  {lines}
                </div>
              );
            })()}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button style={ghost} disabled={busy} onClick={() => onSend("draft")}>Send as drafts</button>
              {canSchedule && <button style={hot} disabled={busy} onClick={() => onSend("scheduled")}>Schedule in {SCHEDULER_NAME}</button>}
            </div>
            <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>One post per network, each with its own caption{p.kind === "reel" ? " and the cover from the first half-second" : p.kind === "carousel" ? "; LinkedIn turns the slides into a PDF carousel" : ""}. Drafts don&apos;t publish.{!canSchedule ? (isOwner ? " Approve it and give it a date to schedule it." : ` ${OWNER} schedules approved pieces.`) : ""}</span>
          </>
        )}
      {cs && (
        <div style={{ display: "grid", gap: 6, padding: "10px 12px", borderRadius: 6, background: C.soft }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <b style={{ font: `700 13px ${HEAD}` }}>{cs.mode === "draft" ? "Sent as drafts" : "Scheduled"} {new Date(cs.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</b>
            <button style={{ ...link, marginLeft: "auto", fontSize: 12 }} disabled={busy} onClick={onRefresh}>Check where they stand</button>
          </div>
          {cs.results.map((r, i) => (
            <div key={i} style={{ fontSize: 12.5, lineHeight: 1.45, color: r.ok ? C.ink : C.warn }}>
              <b>{LABEL[r.platform as Platform] ?? r.platform}</b>: {r.ok ? `${r.status || (cs.mode === "draft" ? "draft" : "scheduled")}${r.detail ? ` (${r.detail})` : ""}${r.warning ? ` · ${r.warning}` : ""}` : r.error}
            </div>
          ))}
        </div>
      )}
      {drv && (
        <div style={{ display: "grid", gap: 6, fontSize: 12.5, lineHeight: 1.45, color: C.text }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <b style={{ font: `700 13px ${HEAD}`, color: C.ink }}>Google Drive</b>
            {!drv.ready ? <span style={{ color: C.muted }}>Not connected yet. Once it is, scheduled pieces copy there on their own.</span>
              : saved ? <span>Saved {new Date(saved.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}, {saved.files.length} file{saved.files.length === 1 ? "" : "s"}. {saved.url && <a href={saved.url} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 12.5 }}>Open the folder</a>}</span>
              : scheduled ? <span>{drv.drive?.error ? <span style={{ color: C.warn }}>{drv.drive.error}</span> : "Not saved yet. It copies on its own a minute after scheduling; save it here if it doesn't show."}</span>
              : <span style={{ color: C.muted }}>Its files copy here once it&apos;s scheduled.</span>}
            {drv.ready && scheduled && <button style={{ ...link, fontSize: 12.5, marginLeft: "auto" }} disabled={busy || saving} onClick={toDrive}>{saving ? "Saving…" : saved ? "Save again" : drv.drive?.error ? "Try again" : "Save to Drive"}</button>}
          </div>
          {drvErr && <span style={{ color: C.warn }}>{drvErr}</span>}
          {drv.name && <span style={{ color: C.muted, wordBreak: "break-all" }}>File name: {drv.name}{p.kind === "reel" ? ".mp4" : p.kind === "carousel" ? "_slide-01.png" : p.kind === "post" ? ".txt" : ""}</span>}
        </div>
      )}
    </div>
  );
}
