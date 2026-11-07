"use client";
import { C, HEAD, CHECKS, VERDICT, btn, ghost, card, chip, label } from "../../lib/ui";
import type { Review } from "../../lib/types";
import Glyph from "./Glyph";
import { OWNER, COACH } from "../../lib/brand";

type Props = { review: Review | null; big?: boolean; compact?: boolean; busy?: boolean; team?: boolean; hideFixes?: boolean; answer?: string | null; onAsk?: () => void; onFix?: () => void; onHook?: (h: string) => void; canUse?: (f: Review["fixes"][number]) => boolean; onUseFix?: (f: Review["fixes"][number]) => void };

// The coach's verdict: the word decides, the score sorts, the fixes say exactly what to change.
export default function CoachCard({ review, big, compact, busy, team, hideFixes, answer, onAsk, onFix, onHook, canUse, onUseFix }: Props) {
  if (!review)
    return (
      <div style={{ ...card, padding: 16, display: "flex", gap: 12, alignItems: "center", background: C.soft, flexWrap: "wrap", flexShrink: 0 }}>
        <Glyph kind="coach" size={26} />
        <div style={{ flex: "1 1 180px" }}>
          <b style={{ fontFamily: HEAD, fontSize: 15 }}>{busy ? `${COACH} is reviewing…` : `${COACH} hasn't seen this yet`}</b>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{busy ? `Checking it against ${OWNER}'s standard. About a minute.` : `It checks every piece against ${OWNER}'s standard before ${OWNER} sees it.`}</div>
        </div>
        {onAsk && <button style={btn} disabled={busy} onClick={onAsk}>{busy ? "Reviewing…" : `Ask ${COACH}`}</button>}
      </div>
    );
  const v = VERDICT[review.verdict];
  const failed = review.checks.filter((c) => !c.pass);
  const passed = review.checks.filter((c) => c.pass);
  const name = (id: string) => CHECKS.find((c) => c.id === id)?.label ?? id;
  return (
    // flexShrink 0: inside a scrolling side panel, a clipped box would otherwise shrink to nothing.
    <section className="rise" style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}`, background: "#fff", flexShrink: 0 }}>
      <div style={{ background: C.navy, color: "#fff", padding: big ? "22px 24px" : "16px 18px", display: "flex", gap: big ? 20 : 14, alignItems: "center" }}>
        <div aria-label={`Score ${review.score} out of 100`} style={{ font: `800 ${big ? 76 : 46}px/0.85 ${HEAD}`, letterSpacing: "-0.05em", color: review.verdict === "ready" ? C.accent : "#fff", minWidth: big ? 100 : 62 }}>{review.score}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ ...label, color: C.onNavy }}>{COACH}</span>
            <span className="flip" style={chip(v)}>{v.label}</span>
          </div>
          <div style={{ fontSize: big ? 17 : 14, lineHeight: 1.45 }}>&ldquo;{review.headline}&rdquo;</div>
        </div>
      </div>
      {!compact && (
        <div style={{ padding: big ? "18px 24px" : "14px 18px", display: "grid", gap: 14 }}>
          {failed.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              {failed.map((c) => (
                <div key={c.id} style={{ display: "grid", gridTemplateColumns: big ? "112px 1fr" : "1fr", gap: big ? 10 : 4, fontSize: 13, lineHeight: 1.45 }}>
                  <span style={{ ...chip({ label: "", bg: "#fff", fg: C.navy, border: `1.5px solid ${C.navy}` }), justifyContent: "center", justifySelf: big ? "stretch" : "start" }}>{name(c.id)}</span>
                  <span>{c.note}</span>
                </div>
              ))}
            </div>
          )}
          {passed.length > 0 && <div style={{ fontSize: 12, color: C.muted }}><b style={{ color: C.text }}>Passes:</b> {passed.map((c) => name(c.id)).join(" · ")}</div>}
          {review.question && (
            <div style={{ borderRadius: 6, padding: "12px 14px", background: C.soft }}>
              <div style={label}>{answer ? `${OWNER} answered` : `Only ${OWNER} can answer`}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4, lineHeight: 1.4 }}>{review.question}</div>
              {answer && !team && <div style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5, background: "#eef7fd", padding: "8px 10px", borderRadius: 4 }}>&ldquo;{answer}&rdquo;</div>}
              {answer && team && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>{OWNER}&apos;s answer is in the box above.</div>}
              {!answer && team && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>It&apos;s in {OWNER}&apos;s queue. The answer shows up here.</div>}
            </div>
          )}
          {/* a reel's suggestions live under the video, where each one is applied or disregarded */}
          {hideFixes && review.fixes.length > 0 && <div style={{ fontSize: 12.5, color: C.text }}>{review.fixes.length} suggestion{review.fixes.length > 1 ? "s" : ""} under the video, in Change this reel.</div>}
          {!hideFixes && review.fixes.length > 0 && (
            <details open={!!big} style={{ display: "grid", gap: 10 }}>
              <summary style={{ ...label, cursor: "pointer", marginBottom: 8 }}>Fixes ({review.fixes.length})</summary>
              {review.fixes.map((f, i) => (
                <div key={i} style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
                  <div style={{ fontWeight: 600 }}>{f.where ? `${f.where} · ` : ""}{f.problem}</div>
                  {f.before && <div style={{ color: C.muted, textDecoration: "line-through", textDecorationColor: "rgba(12,26,36,.45)" }}>{f.before}</div>}
                  {f.after && <div style={{ background: "#eef7fd", padding: "4px 8px", borderRadius: 4, marginTop: 2 }}>{f.after}</div>}
                  {onUseFix && canUse?.(f) && <button style={{ ...ghost, minHeight: 32, padding: "0 12px", fontSize: 12.5, marginTop: 6 }} disabled={busy} onClick={() => onUseFix(f)}>Use this fix</button>}
                </div>
              ))}
            </details>
          )}
          {review.hooks.length > 0 && (
            <details open={!!big}>
              <summary style={{ ...label, cursor: "pointer", marginBottom: 8 }}>Stronger first lines ({review.hooks.length})</summary>
              {review.hooks.map((h) => (
                <div key={h} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.45, marginBottom: 8 }}>
                  <span style={{ flex: 1 }}>{h}</span>
                  {onHook && <button style={{ ...ghost, minHeight: 30, padding: "0 10px", fontSize: 12 }} onClick={() => onHook(h)}>Use it</button>}
                </div>
              ))}
            </details>
          )}
          {(onFix || onAsk) && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {onFix && review.verdict !== "ready" && <button style={btn} disabled={busy} onClick={onFix}>Fix it for me</button>}
              {onAsk && <button style={ghost} disabled={busy} onClick={onAsk}>{busy ? "Reviewing…" : "Review again"}</button>}
              <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>Reviewed {new Date(review.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
