"use client";
import { useCallback, useEffect, useState } from "react";
import { C, HEAD, ghost, hot, label, link } from "../../lib/ui";
import type { Look, LookView, LookWords, RenderView, ThumbOption, ThumbView } from "../../lib/thumbnail";
import Glyph from "./Glyph";
import { OWNER } from "../../lib/brand";

// The full episode's YouTube thumbnail, made with the thumbnail builder on a cloud machine (lib/thumbnail.ts). The
// owner makes two calls: which words, then which thumbnail. The words come from the episode's biggest takeaway;
// option 1 is made on its own once the episode is produced, in every look it plays (the call, the number wall, the
// board), the look the owner published least lately first.
const NAME: Record<Look, string> = { call: "the call", wall: "the number wall", board: "the board" };
const show = (w: Partial<LookWords>) => [w.order === "hero-first" ? w.hero : w.support, w.order === "hero-first" ? w.support : w.hero, w.sticker].filter(Boolean).join(" / ");
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const lastLine = (log: string) => log.trim().split("\n").filter(Boolean).slice(-1)[0]?.replace(/^FAILED:?\s*(to start:\s*)?/, "").replace(/\s*\(total \d+ s\)$/, "") ?? "";
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// An option's words, one line per set of words, with the looks they play.
function wordLines(o: ThumbOption) {
  const by = new Map<string, LookWords[]>();
  for (const l of o.looks) by.set(show(l), [...(by.get(show(l)) ?? []), l]);
  return [...by.entries()].map(([words, ls]) => ({
    words,
    meta: [list(ls.map((l) => NAME[l.look])), ...ls.filter((l) => l.look === "call").flatMap((l) => [l.mark ? `loop on ${l.hero}` : "", o.guest_at != null ? `guest frame at ${mmss(o.guest_at)}` : ""]), ls[0].hook_type].filter(Boolean).join(" · "),
  }));
}

export default function Thumbnail({ episodeId, isOwner }: { episodeId: string; isOwner: boolean }) {
  const [t, setT] = useState<ThumbView | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  // which option's thumbnails are on screen (the one made last, unless another made one is picked here)
  const [showing, setShowing] = useState<number | null>(null);
  const url = `/api/episodes/${episodeId}/thumbnail`;
  const load = useCallback(async () => {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json().catch(() => ({ error: `The app answered ${r.status}.` }));
    if (!r.ok || j.error) throw new Error(j.error ?? `The app answered ${r.status}.`);
    setT(j.thumb);
  }, [url]);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);
  // a machine is working: check on it every 10 seconds
  const running = t?.words?.status === "running" || !!t?.renders.some((r) => r.status === "running");
  useEffect(() => {
    if (!running) return;
    const h = setInterval(() => { load().catch(() => {}); }, 10000);
    return () => clearInterval(h);
  }, [running, load]);

  async function act(body: Record<string, unknown>) {
    setBusy(String(body.action)); setErr("");
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({ error: `The app answered ${r.status}.` }));
      if (!r.ok || j.error) throw new Error(j.error ?? `The app answered ${r.status}.`);
      setT(j.thumb);
      if (body.action !== "pick") setShowing(null);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  }

  const w = t?.words;
  const cur = t?.renders.find((r) => r.option === (showing ?? t.current)) ?? null;
  const made = (n: number) => t?.renders.find((r) => r.option === n);

  return (
    <section style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Glyph kind="episode" size={18} />
        <span style={{ ...label, color: C.ink }}>YouTube thumbnail</span>
      </div>
      {err && <p role="alert" style={{ margin: 0, fontSize: 13, color: C.warn, lineHeight: 1.45 }}>{err}</p>}
      {!t && !err && <div style={{ fontSize: 13.5, color: C.muted }}>Loading…</div>}

      {t && !t.transcript && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.text }}>The thumbnail words come from the transcript. Add it first.</p>}

      {t?.transcript && !w && (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: C.text }}>
            {t.produced ? "Three thumbnail options get written from the episode's biggest takeaway, then option 1 is made in every look it plays." : "Three thumbnail options come once the full episode is produced. Option 1 is then made in every look it plays, on its own."}
          </p>
          <button style={{ ...ghost, justifySelf: "start" }} disabled={!!busy} onClick={() => act({ action: "words" })}>Write the thumbnail words now</button>
        </div>
      )}

      {w?.status === "running" && (
        <div className="rise" style={{ padding: 14, background: C.soft, borderRadius: 6, display: "grid", gap: 6, fontSize: 13, lineHeight: 1.45 }}>
          <b style={{ fontFamily: HEAD }}>Finding the biggest takeaway and writing three thumbnail options on a cloud machine.</b>
          <span style={{ color: C.text }}>About 3 minutes, from the transcript, the episode title and {OWNER}&apos;s thumbnail rules. This page checks on it by itself.</span>
          {lastLine(w.log) && <span style={{ fontSize: 12, color: C.muted }}>{lastLine(w.log)}</span>}
        </div>
      )}
      {w?.status === "failed" && (
        <div style={{ display: "grid", gap: 8 }}>
          <p role="alert" style={{ margin: 0, fontSize: 13, color: C.warn, lineHeight: 1.45 }}>The words didn&apos;t come out: {lastLine(w.log) || "no reason given"}</p>
          <button style={{ ...ghost, justifySelf: "start" }} disabled={!!busy} onClick={() => act({ action: "words" })}>Try again</button>
        </div>
      )}

      {w?.status === "ready" && (
        <div style={{ display: "grid", gap: 8 }}>
          {w.takeaway && (
            <div style={{ display: "grid", gap: 4 }}>
              <span style={label}>Biggest takeaway</span>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: C.ink }}>{w.takeaway}</span>
            </div>
          )}
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: C.text }}>
            {isOwner ? "Pick the words. Each option is made in every look it plays." : `${OWNER} picks the words, then the thumbnail.`}
            {w.title ? ` They go with the title "${w.title}".` : ""}
          </p>
          {w.options.map((o) => {
            const r = made(o.n);
            const on = cur?.option === o.n;
            return (
              <div key={o.n} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", borderRadius: 6, border: `1px solid ${on ? C.ink : C.line}`, background: "#fff" }}>
                <span style={{ font: `700 13px ${HEAD}`, color: C.muted, width: 16 }}>{o.n}</span>
                <div style={{ flex: "1 1 220px", display: "grid", gap: 6 }}>
                  {wordLines(o).map((l) => (
                    <div key={l.words} style={{ display: "grid", gap: 2 }}>
                      <span style={{ font: `800 16px ${HEAD}`, letterSpacing: "0.02em", color: C.ink }}>{l.words}</span>
                      <span style={{ fontSize: 12, color: C.muted }}>{l.meta}</span>
                    </div>
                  ))}
                  {o.why && <span style={{ fontSize: 13, lineHeight: 1.45, color: C.text }}>{o.why}</span>}
                </div>
                {r?.status === "running" ? <span style={{ fontSize: 12.5, color: C.muted }}>Making the looks…</span>
                  : on && r?.status === "ready" ? <span style={{ fontSize: 12.5, color: C.muted }}>Shown below</span>
                  : r?.status === "ready" ? <button style={{ ...link, fontSize: 13 }} onClick={() => setShowing(o.n)}>Show the looks</button>
                  : isOwner ? <button style={ghost} disabled={!!busy} onClick={() => act({ action: "render", option: o.n })}>{r?.status === "failed" ? "Try again" : "Make this one"}</button>
                  : r?.status === "failed" ? <button style={ghost} disabled={!!busy} onClick={() => act({ action: "render", option: o.n })}>Try again</button> : null}
              </div>
            );
          })}
          {w.notes && <p style={{ margin: 0, fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>{w.notes}</p>}
          {!t?.picked && <button style={{ ...link, fontSize: 12.5, justifySelf: "start" }} disabled={!!busy || !!t?.renders.some((r) => r.status === "running")} onClick={() => act({ action: "words" })}>Write new options</button>}
        </div>
      )}

      {cur && <Made r={cur} isOwner={isOwner} picked={t?.picked ?? null} busy={!!busy} onPick={(look) => act({ action: "pick", look, option: cur.option })} onRetry={() => act({ action: "render", option: cur.option })} />}
    </section>
  );
}

function Made({ r, isOwner, picked, busy, onPick, onRetry }: { r: RenderView; isOwner: boolean; picked: ThumbView["picked"]; busy: boolean; onPick: (l: Look) => void; onRetry: () => void }) {
  if (r.status === "running") {
    return (
      <div className="rise" style={{ padding: 14, background: C.soft, borderRadius: 6, display: "grid", gap: 6, fontSize: 13, lineHeight: 1.45 }}>
        <b style={{ fontFamily: HEAD }}>Making option {r.option} in every look it plays.</b>
        <span style={{ color: C.text }}>About 5 minutes: the guest&apos;s frame for the call, the words fitted, the photos of {OWNER} placed and the 13 checks run.</span>
        {lastLine(r.log) && <span style={{ fontSize: 12, color: C.muted }}>{lastLine(r.log)}</span>}
      </div>
    );
  }
  if (r.status === "failed") {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <p role="alert" style={{ margin: 0, fontSize: 13, color: C.warn, lineHeight: 1.45 }}>Option {r.option} didn&apos;t come out: {lastLine(r.log) || "no reason given"}</p>
        <button style={{ ...ghost, justifySelf: "start" }} disabled={busy} onClick={onRetry}>Try again</button>
      </div>
    );
  }
  const mine = picked?.option === r.option ? picked.look : null;
  const shownLooks = r.looks.filter((l) => l.status !== "skipped");
  const skipped = r.looks.filter((l) => l.status === "skipped");
  // a note every card carries (the read at feed size without OCR) shows once, under them
  const shared = shownLooks.length > 1 ? (shownLooks[0].notes ?? []).filter((n) => shownLooks.every((l) => (l.notes ?? []).includes(n))) : [];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 13, color: C.text }}>Option {r.option}{r.suggested ? `: ${NAME[r.suggested]} goes first, the look ${OWNER} published least lately.` : ""}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {shownLooks.map((l) => <Card key={l.look} l={l} skip={shared} first={l.look === r.suggested} guestSheet={l.look === "call" ? r.guest_sheet : null} isOwner={isOwner} chosen={mine === l.look} busy={busy} onPick={() => onPick(l.look)} />)}
      </div>
      {skipped.map((l) => (
        <p key={l.look} style={{ margin: 0, fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>
          {l.name} isn&apos;t made for this option: {l.reason}.{l.look === "call" && r.guest_sheet ? " " : ""}
          {l.look === "call" && r.guest_sheet && <a href={r.guest_sheet} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 12.5 }}>Guest frames</a>}
        </p>
      ))}
      {[...r.notes, ...shared].map((n) => <p key={n} style={{ margin: 0, fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>{n}</p>)}
      {mine ? <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.5 }}>{OWNER} picked {NAME[mine]}. It goes to YouTube with the video.</p>
        : !isOwner && shownLooks.some((l) => l.status === "delivered") && <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>Waiting for {OWNER} to pick one.</p>}
    </div>
  );
}

function Card({ l, skip, first, guestSheet, isOwner, chosen, busy, onPick }: { l: LookView; skip: string[]; first: boolean; guestSheet: string | null; isOwner: boolean; chosen: boolean; busy: boolean; onPick: () => void }) {
  const ok = l.status === "delivered";
  // a thumbnail whose file has gone (cleared after posting) shows a plain note instead of a broken image
  const [gone, setGone] = useState(false);
  return (
    <figure style={{ margin: 0, display: "grid", gap: 6, alignContent: "start" }}>
      {l.image && !gone ? <img src={l.image} alt={`${l.name} thumbnail`} onError={() => setGone(true)} style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 6, border: `${chosen ? 3 : 1}px solid ${chosen ? C.accent : C.line}`, background: C.soft }} />
        : <div style={{ aspectRatio: "16 / 9", borderRadius: 6, background: C.soft, display: "grid", placeItems: "center", fontSize: 12.5, color: C.muted }}>{l.image ? "The image file is no longer here." : "Didn't pass its checks"}</div>}
      <figcaption style={{ display: "grid", gap: 4, fontSize: 12.5, lineHeight: 1.45, color: C.text }}>
        <span><b style={{ fontFamily: HEAD }}>{l.name}</b>{l.label ? ` · ${l.label}` : ""}{first ? " · suggested" : ""}</span>
        {l.words?.hero && <span style={{ color: C.ink }}>{show(l.words)}{l.rounds ? " (shortened to fit)" : ""}</span>}
        {ok ? <span>Passed all {l.checks?.run ?? 13} checks.</span>
          : <span style={{ color: C.warn }}>Didn&apos;t pass: {(l.fails ?? []).map((f) => f.split(":")[0]).join(", ") || "no report"}.</span>}
        {l.guest && <span style={{ color: C.muted }}>Guest frame at {mmss(l.guest.picked)}{l.guest.exact ? "" : " (the sharpest frame near the line)"}.</span>}
        {(l.notes ?? []).filter((n) => !skip.includes(n)).map((n) => <span key={n} style={{ color: C.muted }}>{n}</span>)}
        <span style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {l.review && <a href={l.review} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 12.5 }}>Review sheet</a>}
          {l.feed && <a href={l.feed} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 12.5 }}>Feed sheet</a>}
          {guestSheet && <a href={guestSheet} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 12.5 }}>Guest frames</a>}
          {l.image && <a href={`${l.image}&download=thumbnail-${l.look}.jpg`} style={{ ...link, fontSize: 12.5 }}>Download</a>}
        </span>
      </figcaption>
      {isOwner && ok && (chosen
        ? <span style={{ font: `700 13px ${HEAD}`, color: C.ink }}>Your pick</span>
        : <button style={{ ...hot, justifySelf: "start" }} disabled={busy} onClick={onPick}>Use this one</button>)}
    </figure>
  );
}
