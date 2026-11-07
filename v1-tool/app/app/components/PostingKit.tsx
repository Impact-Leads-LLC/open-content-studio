"use client";
import { useEffect, useState } from "react";
import { C, HEAD, ghost, hot, link, label } from "../../lib/ui";
import { OWNER, SCHEDULER_NAME } from "../../lib/brand";
import type { ViewPiece } from "../../lib/types";

type Kit = { files: { name: string; url: string; kind: string }[]; posts: { network: string; label: string; text: string; firstComment: string | null; limit: number; warnings: string[] }[]; when: string | null; timezone: string; error?: string };

// For a studio that posts with a scheduler the app doesn't connect to (Flick, Buffer, Later...): the piece's files to
// download and each network's caption to copy, written exactly as they'd be sent, then "Scheduled it" so the calendar
// and the cleanup know it went out (lib/postkit.ts).
export default function PostingKit({ p, isOwner, busy, onHandoff }: { p: ViewPiece; isOwner: boolean; busy: boolean; onHandoff?: (undo: boolean) => void }) {
  const [kit, setKit] = useState<Kit | null>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => { fetch(`/api/pieces/${p.id}/kit`).then((r) => r.json()).then(setKit).catch(() => setKit({ files: [], posts: [], when: null, timezone: "", error: "Couldn't load the posting kit." })); }, [p.id, p.status, p.scheduled_at, p.caption, p.body]);
  const copy = async (key: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch { /* the text is selectable too */ } };
  const approved = ["approved", "scheduled"].includes(p.status) && !!p.scheduled_at;
  const handed = (p.media as { handoff?: { at: string; by: string; tool: string } })?.handoff;
  const when = p.scheduled_at ? new Date(p.scheduled_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: kit?.timezone || undefined }) : "";
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={label}>Post it in {SCHEDULER_NAME}</span>
        {when && <span style={{ fontSize: 12, color: C.muted }}>{when}</span>}
      </div>
      {!kit ? <span style={{ fontSize: 13, color: C.muted }}>Getting the files and captions…</span> : kit.error ? <span style={{ fontSize: 13, color: C.warn }}>{kit.error}</span> : (
        <>
          <div style={{ display: "grid", gap: 6 }}>
            <b style={{ font: `700 13px ${HEAD}` }}>Files</b>
            {kit.files.length ? kit.files.map((f) => <a key={f.url} href={f.url} style={{ ...link, fontSize: 13 }}>{f.name}</a>) : <span style={{ fontSize: 13, color: C.muted }}>No files yet. Make the piece first.</span>}
          </div>
          {kit.posts.map((x) => (
            <div key={x.network} style={{ display: "grid", gap: 6, padding: "10px 12px", borderRadius: 6, background: C.soft }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <b style={{ font: `700 13px ${HEAD}` }}>{x.label}</b>
                <span style={{ fontSize: 12, color: x.text.length > x.limit ? C.warn : C.muted }}>{x.text.length.toLocaleString()} / {x.limit.toLocaleString()}</span>
                <button style={{ ...link, fontSize: 12.5, marginLeft: "auto" }} onClick={() => copy(x.network, x.text)} disabled={!x.text}>{copied === x.network ? "Copied" : "Copy the caption"}</button>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: C.text, whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}>{x.text || "No caption yet."}</div>
              {x.firstComment && <div style={{ fontSize: 12.5, color: C.text }}>First comment: {x.firstComment} <button style={{ ...link, fontSize: 12 }} onClick={() => copy(`${x.network}-c`, x.firstComment!)}>{copied === `${x.network}-c` ? "Copied" : "Copy"}</button></div>}
              {x.warnings.map((w) => <span key={w} style={{ fontSize: 12, color: C.warn }}>{w}</span>)}
            </div>
          ))}
          {handed ? (
            <div style={{ fontSize: 13, color: C.text, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span>Scheduled in {handed.tool} by {handed.by}, {new Date(handed.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.</span>
              {onHandoff && <button style={{ ...link, fontSize: 12.5 }} disabled={busy} onClick={() => onHandoff(true)}>Take it back</button>}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {onHandoff && <button style={approved ? hot : ghost} disabled={busy || !approved} onClick={() => onHandoff(false)}>Scheduled it in {SCHEDULER_NAME}</button>}
              <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{approved ? `Upload the files and captions in ${SCHEDULER_NAME} for ${when}, then mark it here. Its files leave storage a week after that date.` : isOwner ? "Approve it and give it a date, then post it in your scheduler." : `${OWNER} approves it and gives it a date first.`}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
