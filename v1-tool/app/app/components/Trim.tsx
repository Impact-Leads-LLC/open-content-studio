"use client";
import { useEffect, useRef, useState } from "react";
import { C, HEAD, btn, ghost, link, input, label } from "../../lib/ui";
import { secs, clock } from "../../lib/time";
import type { Line } from "../../lib/transcript";
import Lines from "./Lines";

type Props = { src: string; start0: number; end0: number; lines: Line[]; rough?: boolean; busy?: boolean; action?: string; offset?: number; wideOk?: boolean; onCut?: (start: number, end: number) => void; onChange?: (start: number, end: number, problem: string) => void };

// Pick the part of the full episode to use: the player sits on the moment, the transcript shows what's said, and the
// start and end move by sentence ("Start here", "End here") or to where the video is. The parent hears every change
// (onChange) and makes the reel from it; onCut adds a button of its own. Every time here is on the recording's clock:
// `offset` is where the video starts in the recording (the full-episode edit drops the silence before the first word).
// `wideOk`: the cut comes from the camera feeds, which are cropped to 9:16, so a landscape player is fine.
export default function Trim({ src, start0, end0, lines, rough, busy, action = "Cut this clip", offset = 0, wideOk, onCut, onChange }: Props) {
  const v = useRef<HTMLVideoElement>(null);
  const stopAt = useRef<number | null>(null);
  const [start, setStart] = useState(start0);
  const [end, setEnd] = useState(end0);
  const [sText, setSText] = useState(clock(start0));
  const [eText, setEText] = useState(clock(end0));
  const [now, setNow] = useState(start0);
  const [dur, setDur] = useState(0);
  const [wide, setWide] = useState(false);
  useEffect(() => { setStart(start0); setEnd(end0); setSText(clock(start0)); setEText(clock(end0)); }, [start0, end0]);

  const setS = (t: number) => { setStart(t); setSText(clock(t)); };
  const setE = (t: number) => { setEnd(t); setEText(clock(t)); };
  const seek = (t: number) => { if (v.current) v.current.currentTime = Math.max(0, t - offset); };
  const playFrom = (t: number) => { const el = v.current; if (!el) return; stopAt.current = null; el.currentTime = Math.max(0, t - offset); el.play().catch(() => {}); };
  const play = () => { const el = v.current; if (!el) return; el.currentTime = Math.max(0, start - offset); stopAt.current = end; el.play().catch(() => {}); };
  const len = end - start;
  const problem = !(len > 0) ? "The end has to come after the start." : len < 3 || len > 90 ? "Keep the clip between 3 and 90 seconds." : wide && !wideOk ? "This video is landscape. Add the camera feeds (each person's track from Riverside) and the reel is cut from them in 9:16." : "";
  useEffect(() => { onChange?.(start, end, problem); }, [start, end, problem]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (t: number) => `${dur ? Math.min(100, Math.max(0, (t / dur) * 100)) : 0}%`;
  // The top strip zooms in on the cut plus 30 seconds either side, so a second is easy to see; the thin one is the whole episode.
  const lo = Math.max(0, start - 30), hi = Math.min(dur || end + 30, Math.max(end + 30, lo + 60));
  const z = (t: number) => `${Math.min(100, Math.max(0, ((t - lo) / (hi - lo || 1)) * 100))}%`;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <video
        ref={v}
        src={`${src}#t=${Math.max(0, start0 - offset)}`}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => { const el = e.currentTarget; setDur(el.duration ? el.duration + offset : 0); setWide(el.videoWidth > el.videoHeight); }}
        onTimeUpdate={(e) => { const t = e.currentTarget.currentTime + offset; setNow(t); if (stopAt.current !== null && t >= stopAt.current) { e.currentTarget.pause(); stopAt.current = null; } }}
        style={{ width: "100%", maxHeight: 320, background: C.navy, borderRadius: 6 }}
      />
      <div aria-hidden style={{ display: "grid", gap: 4 }}>
        <div onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(lo + ((e.clientX - r.left) / r.width) * (hi - lo)); }} style={{ position: "relative", height: 26, borderRadius: 6, background: C.soft, border: `1px solid ${C.line}`, cursor: "pointer", overflow: "hidden" }}>
          <span style={{ position: "absolute", top: 0, bottom: 0, left: z(start), width: `calc(${z(end)} - ${z(start)})`, background: C.navy, borderRadius: 4 }} />
          <span style={{ position: "absolute", top: -2, bottom: -2, left: z(now), width: 2, background: C.accent }} />
        </div>
        <div style={{ position: "relative", height: 4, borderRadius: 2, background: C.line }}>
          <span style={{ position: "absolute", top: 0, bottom: 0, left: pct(start), width: `calc(${pct(end)} - ${pct(start)})`, minWidth: 3, background: C.navy, borderRadius: 2 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted }}><span>{clock(lo)}</span><span>Whole episode {dur ? clock(dur) : ""}</span><span>{clock(hi)}</span></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {([["Start", sText, setSText, setS, start], ["End", eText, setEText, setE, end]] as const).map(([name, text, setText, set, val]) => (
          <label key={name} style={{ display: "grid", gap: 4 }}>
            <span style={label}>{name}</span>
            <input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { const t = secs(text); if (Number.isFinite(t)) { set(t); seek(t); } else setText(clock(val)); }} style={{ ...input, font: `700 16px ${HEAD}` }} />
            <button type="button" style={{ ...link, justifySelf: "start", fontSize: 13 }} onClick={() => set(Math.round(((v.current?.currentTime ?? 0) + offset) * 10) / 10)}>Use current time</button>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ font: `800 22px ${HEAD}`, letterSpacing: "-0.02em" }}>{len > 0 ? `${len.toFixed(1)} s` : ""}</span>
        <button type="button" style={ghost} onClick={play}>Watch this part</button>
        {onCut && <button type="button" style={btn} disabled={!!problem || busy} onClick={() => onCut(start, end)}>{action}</button>}
      </div>
      {problem && <p style={{ margin: 0, fontSize: 13, color: C.warn }}>{problem}</p>}
      {lines.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <span style={label}>What&apos;s said</span>
            <span style={{ fontSize: 11.5, color: C.muted }}>Click a line to play it{rough ? ". Times inside long answers are close, not exact." : "."}</span>
          </div>
          <Lines lines={lines} start={start} end={end} now={now} onSeek={playFrom} onStart={setS} onEnd={setE} />
        </div>
      )}
    </div>
  );
}
