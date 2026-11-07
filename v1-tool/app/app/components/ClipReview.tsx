"use client";
import { useRef, useState } from "react";
import { C } from "../../lib/ui";
import type { Line } from "../../lib/transcript";
import Lines from "./Lines";

// The cut clip next to what's said in it. The line playing is marked; click a line to hear it.
export default function ClipReview({ src, start, end, lines }: { src: string; start: number; end: number; lines: Line[] }) {
  const v = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState<number | undefined>(undefined);
  const play = (t: number) => { const el = v.current; if (!el) return; el.currentTime = Math.max(0, t - start); el.play().catch(() => {}); };
  return (
    <div style={{ display: "grid", gridTemplateColumns: lines.length ? "150px minmax(0, 1fr)" : "150px", gap: 12, alignItems: "start" }}>
      <video ref={v} src={src} controls playsInline preload="metadata" onTimeUpdate={(e) => setNow(start + e.currentTarget.currentTime)} style={{ width: 150, aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 6, background: C.navy }} />
      {lines.length > 0 && <Lines lines={lines} start={start} end={end} now={now} pad={0} height={267} onSeek={play} />}
    </div>
  );
}
