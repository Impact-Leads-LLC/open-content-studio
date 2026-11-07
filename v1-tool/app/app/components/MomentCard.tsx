"use client";
import { C, HEAD, label } from "../../lib/ui";
import type { Moment, Scores } from "../../lib/types";
import { OWNER } from "../../lib/brand";

// The Moment Coach's case for an idea (lib/moments.ts): why it made the board, scored the way the owner would.
export const DIMS: [keyof Scores, string][] = [["hook", "Hook"], ["smart", `${OWNER} teaches`], ["ip", `${OWNER}'s IP`], ["icp", "Speaks to the ICP"], ["standalone", "Stands alone"]];
// its strongest points, best first, three at most so the card stays short
export const strengths = (m: Moment) => DIMS.filter(([k]) => m.scores[k] >= 8).sort(([a], [b]) => m.scores[b] - m.scores[a]).slice(0, 3).map(([, l]) => l);
const TOP = 80;

// The score on an idea card: navy when it's a top pick, outlined otherwise.
export function ScoreBadge({ m }: { m: Moment }) {
  const top = m.score >= TOP;
  return (
    <span title={`Moment Coach: ${m.score}/100`} style={{ display: "inline-grid", placeItems: "center", minWidth: 34, height: 26, padding: "0 6px", borderRadius: 6, font: `800 13px ${HEAD}`, background: top ? C.navy : "#fff", color: top ? "#fff" : m.score >= 65 ? C.ink : C.muted, border: top ? 0 : `1.5px solid ${m.score >= 65 ? C.navy : C.hair}` }}>{m.score}</span>
  );
}

// One line for the card: what's strongest about it.
export function MomentLine({ m }: { m: Moment }) {
  const s = strengths(m);
  return (
    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>
      {m.score >= TOP && <b style={{ color: C.ink, fontFamily: HEAD }}>Top pick{s.length ? " · " : ""}</b>}{s.join(" · ")}
      {m.needs_take && <span style={{ color: C.muted }}>{s.length || m.score >= TOP ? " · " : ""}needs {OWNER}&apos;s take</span>}
      {m.below_bar && <span style={{ color: C.muted }}>{s.length || m.score >= TOP || m.needs_take ? " · " : ""}under the usual bar, fills a short level</span>}
    </div>
  );
}

// The full case, on the piece's own page.
export default function MomentCard({ m, leadMagnet }: { m: Moment; leadMagnet?: string | null }) {
  return (
    <section style={{ borderRadius: 6, border: `1px solid ${C.line}`, overflow: "hidden" }}>
      <div style={{ background: C.navy, color: "#fff", padding: "14px 16px", display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ font: `800 40px/1 ${HEAD}`, letterSpacing: "-0.04em", color: m.score >= TOP ? C.accent : "#fff" }}>{m.score}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...label, color: C.onNavy }}>Why this moment</div>
          <div style={{ font: `600 14.5px/1.45 ${HEAD}`, marginTop: 3 }}>{m.verdict}</div>
        </div>
      </div>
      <div style={{ padding: "14px 16px", display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 7 }}>
          {DIMS.map(([k, l]) => (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "128px 1fr 22px", gap: 10, alignItems: "center", fontSize: 13 }}>
              <span style={{ color: C.text }}>{l}</span>
              <span aria-hidden style={{ height: 8, borderRadius: 4, background: C.line, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${m.scores[k] * 10}%`, borderRadius: 4, background: m.scores[k] >= 8 ? C.navy : "#8796a3" }} /></span>
              <b style={{ font: `800 13px ${HEAD}`, textAlign: "right" }}>{m.scores[k]}</b>
            </div>
          ))}
        </div>
        {m.quote && <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>&ldquo;{m.quote}&rdquo; <span style={{ color: C.muted, fontSize: 13 }}>{m.speaker}</span></p>}
        <div style={{ display: "grid", gap: 5, fontSize: 13, lineHeight: 1.45, color: C.text }}>
          {m.angle && <span><b style={{ color: C.ink }}>The point:</b> {m.angle}</span>}
          {m.ip_name && <span><b style={{ color: C.ink }}>{OWNER}&apos;s IP:</b> {m.ip_name}</span>}
          {m.icp_pain && <span><b style={{ color: C.ink }}>The ICP&apos;s pain:</b> {m.icp_pain}</span>}
          <span><b style={{ color: C.ink }}>Next step:</b> {m.cta === "EPISODE" ? "the full episode" : m.cta ? `comment ${m.cta}${leadMagnet ? ` (${leadMagnet})` : ""}` : "a plain one, since no lead magnet fits"}</span>
          {m.needs_take && <span style={{ color: C.warn }}>{OWNER} doesn&apos;t make a point of their own in this moment, so it carries the guest&apos;s idea, credited, until {OWNER} adds a take.</span>}
        </div>
      </div>
    </section>
  );
}
