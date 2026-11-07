"use client";
import { useEffect, useRef, useState } from "react";
import Glyph from "./Glyph";
import { C, ghost } from "../../lib/ui";

type Result = { isFinal: boolean; 0: { transcript: string } };
type Rec = { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<Result> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type RecClass = new () => Rec;
const engine = () => { const w = window as unknown as { SpeechRecognition?: RecClass; webkitSpeechRecognition?: RecClass }; return w.SpeechRecognition ?? w.webkitSpeechRecognition; };

// Talk instead of type, with the browser's own speech-to-text (Chrome, Edge, Safari). Hidden where there is none.
export default function Dictate({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  const rec = useRef<Rec | null>(null);
  useEffect(() => { setOk(!!engine()); return () => rec.current?.stop(); }, []);
  if (!ok) return null;
  function start() {
    const R = engine();
    if (!R) return;
    const r = new R();
    r.continuous = true; r.interimResults = true; r.lang = "en-US";
    const base = value.trim() ? `${value.trimEnd()} ` : "";
    r.onresult = (e) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        s += (s && !/\s$/.test(s) && !/^\s/.test(t) ? " " : "") + t;
      }
      onChange(base + s.trim());
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r; r.start(); setOn(true);
  }
  const stop = () => { rec.current?.stop(); setOn(false); };
  return (
    <button type="button" onClick={on ? stop : start} aria-pressed={on} style={{ ...ghost, minHeight: 40, padding: "0 14px", ...(on ? { background: C.navy, color: "#fff", border: `1px solid ${C.navy}` } : {}) }}>
      {on ? <span className="listen" style={{ width: 10, height: 10, borderRadius: 5, background: C.accent }} /> : <Glyph kind="microphone" size={18} />}
      {on ? "Listening. Click to stop" : "Dictate"}
    </button>
  );
}
