"use client";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import Glyph from "./Glyph";
import Dictate from "./Dictate";
import { C, HEAD, btn, ghost, label, input, isCaptionFix as capFix } from "../../lib/ui";
import type { Review } from "../../lib/types";
import { OWNER, COACH } from "../../lib/brand";

export type Changes = { apply: number[]; skip: number[]; note: string };
type Props = {
  review: Review | null;
  open: "" | "coach" | "own";
  onOpen: (w: "" | "coach" | "own") => void;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  busy: boolean;
  approved?: boolean;
  onSubmit: (c: Changes) => void;
};

const area = { ...input, padding: 12, minHeight: 110, font: "15px/1.5 Poppins, Arial, sans-serif" } as const;

// The editor's effect library, so an edit can ask for one by name.
const EFFECTS: [string, string][] = [
  ["Checklist", "steps that tick off as they're said"], ["App on top", "the app on top, the speaker underneath"],
  ["Phone", "a phone beside the speaker showing the message"], ["Green screen", "the speaker in front of the app"],
  ["Orbit", "names circling the speaker"], ["Wall", "moments of the episode behind the speaker"],
  ["Headlines", "quotes pinned up behind the speaker"], ["Chart", "a real number growing behind the speaker"],
  ["Cover story", "a magazine masthead behind the speaker's head"], ["Glass word", "one word standing in the room"],
  ["Paper cut", "a paper collage with the speaker as a sticker"], ["Doodle", "a hand-drawn outline around the speaker"],
  ["Post frame", "the speaker breaking out of a social post"], ["Punch-in", "a hard zoom on one word"],
  ["Zoom-through", "a zoom-blur through a cut"], ["Vertigo", "the room falls away while the speaker holds still"],
  ["Player ending", "the end pulls back into the episode's player"],
];

// The two ways to change a reel that's nearly right: go through the coach's suggestions and apply
// or disregard each one, or say what to change in your own words. Either way the edit stays and only that changes.
export default function ReelChanges({ review, open, onOpen, draft, setDraft, busy, approved, onSubmit }: Props) {
  const fixes = review?.fixes ?? [];
  const [pick, setPick] = useState<Record<number, "apply" | "skip">>({});
  const box = useRef<HTMLTextAreaElement>(null);
  // an effect goes into the note with a place to say which line; the cursor lands there
  const addEffect = (name: string, what: string) => {
    const line = `${name} (${what}) on the line ""`;
    const next = (draft.trim() ? `${draft.trimEnd()}\n` : "") + line;
    setDraft(next);
    setTimeout(() => { const el = box.current; if (el) { el.focus(); el.setSelectionRange(next.length - 1, next.length - 1); } }, 0);
  };
  // a new review brings new suggestions: all on "apply" until someone says otherwise
  useEffect(() => setPick({}), [review?.at]);
  const choice = (i: number) => pick[i] ?? "apply";
  const apply = fixes.map((_, i) => i).filter((i) => choice(i) === "apply");
  const skip = fixes.map((_, i) => i).filter((i) => choice(i) === "skip");
  const videoCount = apply.filter((i) => !capFix(fixes[i])).length;
  const tab = (on: boolean) => ({ ...(on ? btn : ghost), minHeight: 56, justifyContent: "flex-start", gap: 10, padding: "0 16px", font: `700 15px ${HEAD}`, width: "100%" });
  return (
    <section style={{ display: "grid", gap: 12, flexShrink: 0 }}>
      <div>
        <div style={{ font: `800 17px ${HEAD}` }}>Change this reel</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>The edit you have stays. Only what you pick or write changes.{approved ? ` ${OWNER} approved this version, so a change goes back to ${COACH} and then to ${OWNER}.` : ""}</div>
      </div>
      <div className="two-up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button style={tab(open === "coach")} disabled={!fixes.length} onClick={() => onOpen(open === "coach" ? "" : "coach")}>
          <Glyph kind="coach" size={22} light={open === "coach"} />
          <span style={{ flex: 1, textAlign: "left" }}>{COACH}&apos;s suggestions</span>
          <span style={{ font: `800 13px ${HEAD}`, minWidth: 24, height: 24, borderRadius: 12, display: "inline-grid", placeItems: "center", background: open === "coach" ? C.accent : C.soft, color: C.ink }}>{fixes.length}</span>
        </button>
        <button style={tab(open === "own")} onClick={() => onOpen(open === "own" ? "" : "own")}>
          <Glyph kind="pencil" size={22} light={open === "own"} />
          <span style={{ flex: 1, textAlign: "left" }}>Your own edits</span>
        </button>
      </div>

      {open === "coach" && fixes.length > 0 && (
        <div className="rise" style={{ border: `1px solid ${C.line}`, borderRadius: 6, overflow: "hidden" }}>
          {fixes.map((f, i) => {
            const on = choice(i) === "apply";
            return (
              <div key={i} style={{ padding: "14px 16px", borderTop: i ? `1px solid ${C.line}` : 0, display: "grid", gap: 6, background: on ? "#fff" : C.soft }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ ...label, color: C.ink }}>{capFix(f) ? "Caption" : "Video"}</span>
                  {f.where && <span style={{ fontSize: 12.5, color: C.muted }}>{f.where}</span>}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5, fontWeight: 600, opacity: on ? 1 : 0.6 }}>{f.problem}</div>
                {on && f.before && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, textDecoration: "line-through", textDecorationColor: "rgba(12,26,36,.45)" }}>{f.before}</div>}
                {on && f.after && <div style={{ fontSize: 13.5, lineHeight: 1.5, background: "#eef7fd", padding: "6px 10px", borderRadius: 4 }}>{f.after}</div>}
                <div role="group" aria-label="Apply or disregard" style={{ display: "inline-flex", justifySelf: "start", marginTop: 4, border: `1px solid ${C.hair}`, borderRadius: 6, overflow: "hidden" }}>
                  {([["apply", "Apply"], ["skip", "Disregard"]] as const).map(([k, l]) => (
                    <button key={k} aria-pressed={choice(i) === k} onClick={() => setPick({ ...pick, [i]: k })} style={{ minHeight: 36, padding: "0 14px", border: 0, cursor: "pointer", font: `700 13px ${HEAD}`, background: choice(i) === k ? C.navy : "#fff", color: choice(i) === k ? "#fff" : C.ink }}>{l}</button>
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ padding: "14px 16px", borderTop: `1px solid ${C.line}`, background: "#fbfcfd", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <button style={btn} disabled={busy} onClick={() => onSubmit({ apply, skip, note: "" })}>{apply.length ? `Apply ${apply.length} change${apply.length > 1 ? "s" : ""}` : "Disregard them all"}</button>
            <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, flex: "1 1 220px" }}>{videoCount ? `A new version in about 10 minutes, then ${COACH} looks again.` : apply.length ? `Caption changes go in straight away, then ${COACH} looks again.` : `${COACH} looks again and won't ask for these.`}</span>
          </div>
        </div>
      )}

      {open === "own" && (
        <div className="rise" style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: 16, display: "grid", gap: 10 }}>
          <label htmlFor="own-edits" style={{ font: `700 15px ${HEAD}` }}>What do you want to change?</label>
          <textarea id="own-edits" ref={box} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} style={area}
            placeholder={"Say it like you'd tell an editor. For example: let it run a couple of seconds longer, I'm about to explain something, so let me finish my thought before it ends. Less of the grid, more of the email."} />
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12.5, color: C.muted }}>Effects: pick one, then say which line it goes on.</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {EFFECTS.map(([name, what]) => (
                <button key={name} type="button" title={what} onClick={() => addEffect(name, what)}
                  style={{ minHeight: 32, padding: "0 11px", borderRadius: 6, border: `1px solid ${C.hair}`, background: "#fff", color: C.ink, cursor: "pointer", font: `600 12.5px ${HEAD}` }}>{name}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button style={btn} disabled={busy || !draft.trim()} onClick={() => onSubmit({ apply: [], skip: [], note: draft.trim() })}>Make these changes</button>
            <Dictate value={draft} onChange={setDraft} />
            <span style={{ fontSize: 12.5, color: C.muted, flex: "1 1 200px", lineHeight: 1.45 }}>The editor keeps the cut and everything else. About 10 minutes for the video.</span>
          </div>
        </div>
      )}
    </section>
  );
}
