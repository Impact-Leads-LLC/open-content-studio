"use client";
import { useEffect, useRef, useState } from "react";
import { C, HEAD, btn, ghost, label, input, link } from "../../lib/ui";
import Glyph from "./Glyph";
import { COACH } from "../../lib/brand";

type Script = { hook: string; lines: string[]; words: number; notes: string; checks?: { hook: string; point: string; why_care: string } };
type Vo = { script?: Script; status?: string; audio?: string; seconds?: number; recorded_at?: string; at?: string; by?: string };

// The owner's voiceover on an animated reel (lib/voiceover.ts): the script first (a hook, why it matters, the point,
// proof, the ask, checked the way the coach checks), then the owner reads it here with the script on screen, or uploads
// a voice memo. Make the reel then times every beat to the take they keep.
export default function VoiceOver({ pieceId, busy }: { pieceId: string; busy: boolean }) {
  const [vo, setVo] = useState<Vo>({});
  const [play, setPlay] = useState<string | null>(null);
  const [work, setWork] = useState("");
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [rec, setRec] = useState<"idle" | "on" | "review">("idle");
  const [secs, setSecs] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const t0 = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const file = useRef<HTMLInputElement | null>(null);

  async function api(body?: unknown) {
    const r = await fetch(`/api/pieces/${pieceId}/voiceover`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}).then((x) => x.json());
    if (r.error) throw new Error(r.error);
    if (r.vo) setVo(r.vo);
    if ("play" in r) setPlay(r.play);
    return r;
  }
  async function step(msg: string, fn: () => Promise<unknown>) {
    setErr(""); setWork(msg);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setWork(""); }
  }
  useEffect(() => { api().catch((e) => setErr(String(e?.message ?? e))); return () => { if (tick.current) clearInterval(tick.current); mr.current?.stream.getTracks().forEach((t) => t.stop()); }; }, [pieceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
      const m = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined);
      chunks.current = [];
      m.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      m.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: m.mimeType || "audio/webm" });
        const seconds = (Date.now() - t0.current) / 1000;
        setTake({ blob, url: URL.createObjectURL(blob), seconds });
        setRec("review");
      };
      mr.current = m;
      t0.current = Date.now(); setSecs(0);
      tick.current = setInterval(() => setSecs((Date.now() - t0.current) / 1000), 250);
      m.start(1000);
      setRec("on");
    } catch {
      setErr("The browser didn't get the microphone. Allow it for this site, or upload a voice memo instead.");
    }
  }
  function stop() {
    if (tick.current) clearInterval(tick.current);
    mr.current?.stop();
  }
  async function keep(blob: Blob, seconds: number, name?: string) {
    await step("Saving the take…", async () => {
      const up = await api({ action: "upload", type: blob.type || "audio/webm", name });
      const fd = new FormData(); fd.append("cacheControl", "3600"); fd.append("", blob, name || "voiceover");
      const r = await fetch(up.signedUrl, { method: "PUT", body: fd });
      if (!r.ok) throw new Error(`The upload didn't go through (${r.status}). Try again.`);
      await api({ action: "audio", path: up.path, seconds });
      setTake(null); setRec("idle");
    });
  }
  function pick(f: File | undefined) {
    if (!f) return;
    const a = new Audio(URL.createObjectURL(f));
    a.onloadedmetadata = () => keep(f, Number.isFinite(a.duration) ? a.duration : 0, f.name);
    a.onerror = () => keep(f, 0, f.name);
  }

  const s = vo.script;
  const lines = s?.lines ?? [];
  const off = !!busy || !!work;
  const mmss = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;

  return (
    <section style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, ...label }}><Glyph kind="microphone" size={18} /> Voiceover</div>

      {!s && (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.text }}>Your voice carries the reel. The script comes first: a hook, why it matters, the point, the proof, then your ask. {COACH} checks it before you read it.</p>
          <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 600 }}>
            <span>Notes for the script <span style={{ fontWeight: 400, color: C.muted }}>optional</span></span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. open on the 87 seconds, keep it under 30 seconds" style={{ ...input, padding: 10, minHeight: 0, font: "14px/1.5 Poppins, Arial, sans-serif" }} />
          </label>
          <div><button style={btn} disabled={off} onClick={() => step("Writing the script (about a minute)…", () => api({ action: "script", notes }))}>Write the script</button></div>
        </div>
      )}

      {s && edit == null && (
        <div style={{ display: "grid", gap: 10 }}>
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6, fontSize: 15, lineHeight: 1.45, color: C.ink }}>
            {lines.map((l, i) => <li key={i} style={i === 0 ? { fontWeight: 700, fontFamily: HEAD } : undefined}>{l}</li>)}
          </ol>
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>{s.words} words, about {Math.round(s.words / 2.6)} seconds read aloud.{s.notes ? ` ${s.notes}` : ""}</div>
          {s.checks && (
            <div style={{ display: "grid", gap: 4, fontSize: 12.5, lineHeight: 1.45, color: C.text, background: C.soft, borderRadius: 6, padding: "10px 12px" }}>
              <span><b>Hook.</b> {s.checks.hook}</span>
              <span><b>Point.</b> {s.checks.point}</span>
              <span><b>Why care.</b> {s.checks.why_care}</span>
            </div>
          )}
          {rec === "idle" && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              <button style={link} disabled={off} onClick={() => setEdit(lines.join("\n"))}>Edit the script</button>
              <button style={link} disabled={off} onClick={() => step("Writing the script again (about a minute)…", () => api({ action: "script", notes }))}>Write it again</button>
            </div>
          )}
        </div>
      )}

      {s && edit != null && (
        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>One spoken sentence per line. The first line is the hook.</span>
          <textarea value={edit} onChange={(e) => setEdit(e.target.value)} rows={Math.max(6, lines.length + 1)} style={{ ...input, padding: 10, minHeight: 0, font: "14px/1.6 Poppins, Arial, sans-serif" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn} disabled={off} onClick={() => step("Saving…", async () => { await api({ action: "save", lines: edit.split("\n") }); setEdit(null); })}>Save the script</button>
            <button style={ghost} disabled={off} onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      )}

      {s && edit == null && rec === "on" && (
        <div style={{ background: C.navy, color: "#fff", borderRadius: 8, padding: "18px 20px", display: "grid", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, font: `700 13px ${HEAD}`, letterSpacing: "0.04em" }}>
            <span className="listen" style={{ width: 10, height: 10, borderRadius: 5, background: "#ff5a5a" }} /> RECORDING {mmss(secs)}
          </div>
          <div style={{ display: "grid", gap: 10, font: "600 22px/1.4 Poppins, Arial, sans-serif" }}>
            {lines.map((l, i) => <p key={i} style={{ margin: 0, color: i === 0 ? "#ffc530" : "#fff" }}>{l}</p>)}
          </div>
          <div><button style={{ ...btn, background: "#ffc530", color: C.ink }} onClick={stop}>Stop</button></div>
        </div>
      )}

      {s && edit == null && rec === "review" && take && (
        <div style={{ display: "grid", gap: 10 }}>
          <audio controls src={take.url} style={{ width: "100%" }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btn} disabled={off} onClick={() => keep(take.blob, take.seconds)}>Keep this take</button>
            <button style={ghost} disabled={off} onClick={() => { setTake(null); setRec("idle"); start(); }}>Record again</button>
          </div>
        </div>
      )}

      {s && edit == null && rec === "idle" && (
        vo.audio ? (
          <div style={{ display: "grid", gap: 8 }}>
            {play && <audio controls src={play} style={{ width: "100%" }} />}
            <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>Your take{vo.seconds ? ` (${vo.seconds} s)` : ""}. Make the reel times every beat to it.</span>
            <div><button style={link} disabled={off} onClick={() => step("Clearing the take…", () => api({ action: "clear" }))}>Record again</button></div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btn} disabled={off} onClick={start}>Record it</button>
              <button style={ghost} disabled={off} onClick={() => file.current?.click()}>Upload a voice memo</button>
              <input ref={file} type="file" accept="audio/*,.m4a,.mp3,.wav,.webm" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>The script stays on screen while you record. A quiet room and your podcast microphone sound best.</span>
          </div>
        )
      )}

      {work && <div style={{ fontSize: 13, color: C.text }}>{work}</div>}
      {err && <div style={{ fontSize: 13, color: C.warn }}>{err}</div>}
    </section>
  );
}
