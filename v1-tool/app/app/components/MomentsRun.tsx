"use client";
import { useState } from "react";
import { C, HEAD, card, link } from "../../lib/ui";
import { STAGE_LABEL, type Awareness } from "../../lib/stages";
import type { MomentsRun as Run } from "../../lib/concepts";
import { COACH } from "../../lib/brand";

// What the Moment Coach's last look at the episode did (lib/concepts.ts, studio_episodes.moments): running, failed with
// why, or what it found, what went on the board, the levels the episode was short on and what was turned down, so the
// team can see the board is complete, or why it isn't.
const KINDS: ["reel" | "carousel" | "post", string, string][] = [["reel", "reel", "reels"], ["carousel", "carousel", "carousels"], ["post", "post", "posts"]];
const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
const ago = (at: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
// still going: a look marked running for longer than the server allows (lib/concepts.ts STALE) was cut off
export const isRunning = (run: Run | null | undefined) => run?.status === "running" && Date.now() - Date.parse(run.at) < 20 * 60000;
const level = (a: string | null) => (a && STAGE_LABEL[a as Awareness] ? STAGE_LABEL[a as Awareness].toLowerCase() : "");

export function MomentsRun({ run }: { run: Run | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!run) return null;
  const box = { ...card, padding: 14, marginBottom: 12, display: "grid", gap: 6, fontSize: 13, lineHeight: 1.5 } as const;
  if (run.status === "running" && !isRunning(run)) {
    return (
      <div className="rise" style={box}>
        <b style={{ fontFamily: HEAD, color: C.warn }}>The last look at this episode didn&apos;t finish.</b>
        <span style={{ color: C.text }}>It started {ago(run.at)} and ran out of time before anything was added. Find more moments tries again.</span>
      </div>
    );
  }
  if (run.status === "running") {
    return (
      <div className="rise" style={box}>
        <b style={{ fontFamily: HEAD }}>Finding the moments.</b>
        <span style={{ color: C.text }}>Started {ago(run.at)}{run.by ? ` by ${run.by}` : ""}. The scout reads the whole episode, then {COACH} judges the reels, carousels and posts side by side: five to ten minutes. The board fills in on its own.</span>
      </div>
    );
  }
  if (run.status === "failed") {
    return (
      <div className="rise" style={box}>
        <b style={{ fontFamily: HEAD, color: C.warn }}>The last look at this episode failed ({ago(run.done_at ?? run.at)}).</b>
        <span style={{ color: C.text }}>{run.error || "No reason came back."} Find more moments tries again.</span>
      </div>
    );
  }
  const r = run.report;
  if (!r) return null;
  const from = run.sources?.length ? <span style={{ color: C.text }}><b style={{ fontFamily: HEAD, color: C.ink }}>From the training material:</b> {run.sources.join(", ")}.{run.why ? ` ${run.why}` : ""}</span> : null;
  // a training-material idea makes no reels, so they're left out of its counts
  const kinds = KINDS.filter(([k]) => k !== "reel" || !run.sources?.length || r.candidates.reel || r.added.reel);
  const added = kinds.map(([k, one, many]) => n(r.added[k] ?? 0, one, many)).join(", ");
  const found = kinds.map(([k, one, many]) => n(r.candidates[k] ?? 0, one, many)).join(", ");
  const failed = r.batches.filter((b) => !b.ok);
  const short = r.gaps.map((g) => g.kind === "reel" ? `reels (${g.got} of at least ${g.want})` : `${level(g.awareness)} ${g.kind === "post" ? "posts" : "carousels"} (${g.got} of ${g.want})`);
  return (
    <div className="rise" style={box}>
      {from}
      <span style={{ color: C.text }}>
        <b style={{ fontFamily: HEAD, color: C.ink }}>Last look, {ago(run.done_at ?? run.at)}:</b> added {added}.{" "}
        The scout found {found}; {COACH} kept {r.kept.reel + r.kept.carousel + r.kept.post}.
        {run.restaged ? ` ${n(run.restaged, "older piece", "older pieces")} got ${run.restaged === 1 ? "its" : "their"} stage.` : ""}
        {r.below_bar ? ` ${n(r.below_bar, "piece sits", "pieces sit")} under the usual bar of ${r.floor}, there because ${r.below_bar === 1 ? "its" : "their"} level was short.` : ""}
      </span>
      {short.length > 0 && <span style={{ color: C.text }}><b style={{ fontFamily: HEAD, color: C.ink }}>Short:</b> {short.join(", ")}. The episode didn&apos;t have enough strong material for {short.length === 1 ? "that level" : "those levels"}; Find more moments looks again.</span>}
      {failed.map((b) => <span key={b.kind} style={{ color: C.warn }}>The {b.kind} pass failed: {b.error}</span>)}
      {r.rejected.length > 0 && (
        <div>
          <button style={{ ...link, fontSize: 13 }} onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} what was turned down ({r.rejected.length})</button>
          {open && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 4, color: C.text, fontSize: 12.5 }}>
              {r.rejected.map((x, i) => <li key={i}><b style={{ fontFamily: HEAD, color: C.ink }}>{x.score}</b> {x.kind}{level(x.awareness) ? `, ${level(x.awareness)}` : ""}: {x.title}. <span style={{ color: C.muted }}>{x.reason}</span></li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
