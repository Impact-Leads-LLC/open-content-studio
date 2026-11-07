"use client";
import { useEffect, useRef } from "react";
import { C, HEAD } from "../../lib/ui";
import { clock } from "../../lib/time";
import type { Line } from "../../lib/transcript";

type Props = { lines: Line[]; start: number; end: number; now?: number; pad?: number; height?: number; onSeek?: (t: number) => void; onStart?: (t: number) => void; onEnd?: (t: number) => void };
const mini = { border: `1px solid ${C.hair}`, background: "#fff", color: C.ink, borderRadius: 4, font: `700 11px ${HEAD}`, padding: "2px 6px", cursor: "pointer", marginLeft: 4 } as const;

// What's said in and around the cut. The line being played is marked, a click plays from that line, and "Start here" /
// "End here" move the cut to a sentence boundary.
export default function Lines({ lines, start, end, now, pad = 15, height = 260, onSeek, onStart, onEnd }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const next = (i: number) => lines[i + 1]?.t ?? lines[i].t + 4;
  const shown = lines.map((l, i) => ({ ...l, i, to: next(i) })).filter((l) => l.to > start - pad && l.t < end + pad);
  // A line counts as in the cut when at least most of a second of it is; a cut that starts half a second early doesn't
  // pull in the line before it.
  const inside = (l: { t: number; to: number }) => l.to > start + 0.75 && l.t < end - 0.75;
  let cur = -1;
  if (now !== undefined) shown.forEach((l, k) => { if (l.t <= now + 0.05) cur = k; });

  // Keep the cut in view when it changes, and follow the playhead while it plays.
  const first = shown.findIndex(inside);
  useEffect(() => { scrollTo(first, true); }, [start, end, lines.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cur >= 0) scrollTo(cur, false); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  function scrollTo(k: number, top: boolean) {
    const b = box.current, el = b?.querySelector<HTMLElement>(`[data-k="${k}"]`);
    if (!b || !el) return;
    if (top || el.offsetTop < b.scrollTop || el.offsetTop + el.offsetHeight > b.scrollTop + b.clientHeight) b.scrollTop = Math.max(0, el.offsetTop - 36);
  }

  if (!shown.length) return <p style={{ margin: 0, fontSize: 13, color: C.muted }}>No transcript lines around this moment. Add the transcript to see what&apos;s said.</p>;
  return (
    <div ref={box} style={{ position: "relative", maxHeight: height, overflowY: "auto", borderRadius: 6, border: `1px solid ${C.line}`, background: "#fff" }}>
      {shown.map((l, k) => {
        const inCut = inside(l), was = k > 0 && inside(shown[k - 1]), isCur = k === cur;
        const newSpeaker = k === 0 || shown[k - 1].who !== l.who;
        return (
          <div key={l.i}>
            {inCut && !was && <div style={{ padding: "6px 10px 2px", font: `800 10.5px ${HEAD}`, letterSpacing: "0.06em", textTransform: "uppercase", color: C.navy }}>Cut starts {clock(start)}</div>}
            <div data-k={k} className={`tline${isCur ? " cur" : ""}`} onClick={() => onSeek?.(l.t)} style={{ display: "grid", gridTemplateColumns: "42px minmax(0, 1fr)", gap: 8, padding: "6px 10px", cursor: onSeek ? "pointer" : "default", background: isCur ? C.soft : inCut ? "#fbfcfd" : "transparent" }}>
              <span style={{ font: `700 11px/18px ${HEAD}`, textAlign: "center", borderRadius: 4, alignSelf: "start", color: isCur ? "#fff" : C.muted, background: isCur ? C.navy : "transparent" }}>{clock(l.t).replace(/\.\d$/, "")}</span>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: inCut ? C.ink : "#8a96a1" }}>
                {newSpeaker && l.who && <b style={{ font: `700 12px ${HEAD}`, marginRight: 6, color: inCut ? C.ink : "#8a96a1" }}>{l.who.split(" ")[0]}</b>}
                {l.text}
                {(onStart || onEnd) && (
                  <span className="tact" style={{ whiteSpace: "nowrap" }}>
                    {onStart && <button type="button" style={mini} onClick={(e) => { e.stopPropagation(); onStart(l.t); }}>Start here</button>}
                    {onEnd && <button type="button" style={mini} onClick={(e) => { e.stopPropagation(); onEnd(l.to); }}>End here</button>}
                  </span>
                )}
              </span>
            </div>
            {inCut && !(k < shown.length - 1 && inside(shown[k + 1])) && <div style={{ padding: "2px 10px 6px", font: `800 10.5px ${HEAD}`, letterSpacing: "0.06em", textTransform: "uppercase", color: C.navy }}>Cut ends {clock(end)}</div>}
          </div>
        );
      })}
    </div>
  );
}
