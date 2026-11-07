"use client";
import { useState } from "react";
import { C, HEAD, btn, ghost, label, input, link } from "../../lib/ui";
import { clock } from "../../lib/time";
import type { Person } from "../../lib/feeds";
import Glyph from "./Glyph";
import { SCHEDULER_NAME } from "../../lib/brand";

type Edit = { status: "running" | "ready" | "failed"; log: string; at: string; path: string; start: number | null; end: number | null; notes?: string; chapters?: string; srt?: string | null; sheet?: string | null };
type Full = { path: string; name: string; size: number; url: string | null };

// The produced full episode, made from the camera feeds on a cloud machine (lib/render.ts startFullEdit, the episode
// engine). Everything below comes standard; notes are for one-off changes. The finished file is the newest in Full
// episode, so the podcast step and the scheduler use it, and it goes to the owner's queue.
export default function FullEdit({ feeds, edit, latest, busy, onStart }: {
  feeds: Person[]; edit: Edit | null; latest: Full | null; busy: boolean; onStart: (start: string, end: string, notes: string) => Promise<unknown>;
}) {
  const [start, setStart] = useState(edit?.start != null ? clock(edit.start) : "");
  const [end, setEnd] = useState(edit?.end != null ? clock(edit.end) : "");
  const [notes, setNotes] = useState(edit?.notes ?? "");
  const [copied, setCopied] = useState(false);
  const cams = feeds.filter((p) => p.video);
  const lines = (edit?.log ?? "").trim().split("\n").filter(Boolean);
  const line = (k: string) => lines.find((l) => l.startsWith(k))?.slice(k.length).trim() ?? "";
  const shots = line("shots:").replace(/^(\d+) \((.*)\)$/, "$1 shots: $2");
  const made = line("episode:");
  const inUse = edit?.status === "ready" && latest?.path === edit.path;
  const running = edit?.status === "running";

  return (
    <section style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Glyph kind="episode" size={18} />
        <span style={{ ...label, color: C.ink }}>Full edit</span>
      </div>
      {!cams.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.text }}>Add each person&apos;s camera from Riverside&apos;s separate tracks (and their microphone file if the camera has no sound). Then the full episode gets edited here.</p>
          <label htmlFor="feeds" style={{ ...ghost, justifySelf: "start" }}>Add the camera feeds</label>
        </div>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.text }}>
            {cams.length > 1
              ? `The camera follows whoever is talking (${cams.map((p) => p.person).join(" or ")}), both side by side when you talk over each other, with slow pushes on long shots and punch-ins on the lines that land.`
              : `One camera (${cams[0].person}), with slow pushes on long shots and punch-ins on the lines that land.`}
            {" "}Every episode also gets a teaser (sound bites, your intro of the guest, your ad read), a title card, the guest introduced, chapter cards, graphics, screen shares and stickers on a board, captions word by word with the key words boxed, an end card and levelled sound. Nothing covers a face.
          </p>
          {running ? (
            <div className="rise" style={{ padding: 14, background: C.soft, borderRadius: 6, display: "grid", gap: 6, fontSize: 13, lineHeight: 1.45 }}>
              <b style={{ fontFamily: HEAD }}>Editing the full episode on a cloud machine.</b>
              <span style={{ color: C.text }}>About 30 to 40 minutes for a 30-minute episode. This page checks on it by itself.</span>
              {lines.length > 0 && <span style={{ fontSize: 12, color: C.muted, whiteSpace: "pre-wrap" }}>{lines.slice(-2).join("\n")}</span>}
            </div>
          ) : (
            <>
              {edit?.status === "failed" && <p role="alert" style={{ margin: 0, fontSize: 13, color: C.warn, lineHeight: 1.45 }}>The edit failed: {lines.slice(-1)[0]?.replace(/^FAILED:?\s*/, "") ?? "no reason given"}</p>}
              {edit?.status === "ready" && (
                <div style={{ display: "grid", gap: 8 }}>
                  {inUse && latest?.url && <video src={latest.url} controls preload="metadata" style={{ width: "100%", borderRadius: 6, background: "#000" }} />}
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: C.text }}>
                    {[made && `Made: ${made}.`, shots && `${shots}.`].filter(Boolean).join(" ")}
                    {inUse ? ` It's the episode file the podcast and ${SCHEDULER_NAME} use.` : latest ? ` A newer upload (${latest.name}) is the one in use now.` : ""}
                  </div>
                  {(edit.srt || edit.sheet) && (
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                      {edit.srt && <a href={`${edit.srt}&download=captions.srt`} style={{ ...link, fontSize: 13 }}>Captions (.srt)</a>}
                      {edit.sheet && <a href={edit.sheet} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 13 }}>Frame sheet</a>}
                    </div>
                  )}
                  {edit.chapters?.trim() && (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                        <span style={label}>YouTube chapters</span>
                        <button type="button" style={{ ...link, fontSize: 12 }} onClick={() => { navigator.clipboard?.writeText(edit.chapters!.trim()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}>{copied ? "Copied" : "Copy"}</button>
                      </div>
                      <pre style={{ margin: 0, padding: 10, background: C.soft, borderRadius: 6, font: "12.5px/1.6 ui-monospace, Menlo, monospace", color: C.text, whiteSpace: "pre-wrap" }}>{edit.chapters.trim()}</pre>
                    </div>
                  )}
                </div>
              )}
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
                <span>Notes for the editor <span style={{ fontWeight: 400, color: C.muted }}>optional, for this episode only</span></span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={notes ? 4 : 2} placeholder="e.g. no graphic about pricing, open on the story about the cookies, use the guest's nickname on the name card" style={{ ...input, minHeight: 0, fontWeight: 400, resize: "vertical" }} />
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ display: "grid", gap: 6, width: 130 }}>
                  <span style={label}>Starts at</span>
                  <input style={input} value={start} placeholder="first word" inputMode="decimal" onChange={(e) => setStart(e.target.value)} />
                </label>
                <label style={{ display: "grid", gap: 6, width: 130 }}>
                  <span style={label}>Ends at</span>
                  <input style={input} value={end} placeholder="last word" inputMode="decimal" onChange={(e) => setEnd(e.target.value)} />
                </label>
                <button style={edit?.status === "ready" ? ghost : btn} disabled={busy} onClick={() => onStart(start, end, notes)}>
                  {edit?.status === "ready" ? "Make it again" : edit?.status === "failed" ? "Try again" : "Make the full episode"}
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.45 }}>Minutes and seconds on the recording, like 2:15, to cut the chat before and after the show. Empty: from just before the first word to just after the last.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
