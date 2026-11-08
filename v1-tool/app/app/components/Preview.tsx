"use client";
import { useState } from "react";
import { C, HEAD } from "../../lib/ui";
import { OWNER_FULL, TAGLINE, HANDLE_BARE } from "../../lib/brand";
import type { ViewPiece } from "../../lib/types";

export type { ViewPiece };

// The owner on the previews: initials in the avatar, the handle over Instagram posts (a slug of the name when no handle
// is set).
const INITIALS = OWNER_FULL.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const FEED_HANDLE = HANDLE_BARE || OWNER_FULL.toLowerCase().replace(/[^a-z0-9._]+/g, "");

// A posted piece's files are cleared some days after it goes out (media.retention): one quiet line says when, and where
// the copies are.
export function Cleared({ r }: { r: { at: string; drive?: string | null } }) {
  const when = new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const url = r.drive && /^https?:\/\//i.test(r.drive) ? r.drive : null;
  return (
    <p style={{ margin: 0, fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>
      Files cleared on {when} after posting.
      {r.drive ? <> {url ? <a href={url} target="_blank" rel="noreferrer" style={{ color: C.muted }}>Copies are in Google Drive.</a> : "Copies are in Google Drive."}</> : null}
    </p>
  );
}
// where a file is missing (cleared, or never uploaded), a plain note sits in its place instead of a broken player
const Missing = ({ what }: { what: string }) => <div style={{ width: "100%", height: "100%", minHeight: 120, display: "grid", placeItems: "center", padding: 16, textAlign: "center", color: "#c7c7c7", fontSize: 12.5, lineHeight: 1.45 }}>The {what} file is no longer here.</div>;

// Neutral platform chrome: the piece should look the way the feed shows it, not like our app.
const SYS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const tab = (on: boolean) => ({ minHeight: 30, padding: "0 10px", borderRadius: 6, border: `1px solid ${on ? C.ink : C.hair}`, background: on ? C.ink : "#fff", color: on ? "#fff" : C.ink, font: `600 12px ${HEAD}`, cursor: "pointer" });
const Avatar = ({ size }: { size: number }) => <div style={{ width: size, height: size, borderRadius: "50%", background: C.navy, color: "#fff", display: "grid", placeItems: "center", font: `700 ${Math.round(size / 3)}px ${HEAD}`, flex: "none" }}>{INITIALS}</div>;

// LinkedIn hides everything after the fold behind "see more": about 140 characters on a phone, 210 on desktop.
const FOLD = { phone: 140, desktop: 210 };
export function LinkedInCard({ body, image }: { body: string; image?: string | null }) {
  const [view, setView] = useState<keyof typeof FOLD>("phone");
  const [noImage, setNoImage] = useState(false);
  const fold = FOLD[view];
  let cut = body.length > fold ? body.lastIndexOf(" ", fold) : body.length;
  if (cut < fold * 0.6) cut = Math.min(fold, body.length);
  const shown = body.slice(0, cut), hidden = body.slice(cut);
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
        {(Object.keys(FOLD) as (keyof typeof FOLD)[]).map((v) => <button key={v} onClick={() => setView(v)} style={tab(view === v)}>{v === "phone" ? "Phone" : "Desktop"}</button>)}
        <span style={{ marginLeft: "auto", fontSize: 12, color: body.length > 3000 ? C.warn : C.muted }}>{body.length.toLocaleString()} / 3,000</span>
      </div>
      <div style={{ maxWidth: view === "phone" ? 380 : 552, background: "#fff", border: "1px solid #dcdad5", borderRadius: 8, padding: "14px 16px", fontFamily: SYS, color: "rgba(0,0,0,.9)", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <Avatar size={44} />
          <div style={{ lineHeight: 1.3 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{OWNER_FULL}</div>{TAGLINE && <div style={{ fontSize: 12, color: "rgba(0,0,0,.6)" }}>{TAGLINE}</div>}<div style={{ fontSize: 12, color: "rgba(0,0,0,.6)" }}>Now</div></div>
        </div>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.45 }}>
          {shown}
          {hidden && <span style={{ display: "inline-block", margin: "0 4px", padding: "0 6px", borderRadius: 4, background: C.ink, color: "#fff", font: `700 10px/18px ${HEAD}`, verticalAlign: "middle" }}>SEE MORE FOLD</span>}
          {hidden}
        </div>
        {image && !noImage && <img src={image} alt="" onError={() => setNoImage(true)} style={{ display: "block", width: "calc(100% + 32px)", margin: "12px -16px -14px", borderRadius: "0 0 8px 8px" }} />}
      </div>
    </div>
  );
}

export function InstaCarousel({ slides, width = 340 }: { slides: string[]; width?: number }) {
  const [i, setI] = useState(0);
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const arrow = (side: "left" | "right") => ({ position: "absolute" as const, top: "50%", [side]: 8, transform: "translateY(-50%)", width: 30, height: 30, borderRadius: "50%", border: 0, background: "rgba(255,255,255,.9)", color: "#000", fontSize: 18, lineHeight: "30px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.25)" });
  return (
    <div style={{ width: "100%", maxWidth: width, background: "#fff", border: "1px solid #dbdbdb", borderRadius: 8, overflow: "hidden", fontFamily: SYS, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}><Avatar size={28} /><b style={{ fontSize: 13 }}>{FEED_HANDLE}</b><span style={{ marginLeft: "auto", fontSize: 12, color: "#737373" }}>{i + 1} / {slides.length}</span></div>
      <div style={{ position: "relative", aspectRatio: "4 / 5", background: "#000" }}>
        {gone[slides[i]] ? <Missing what="slide" /> : <img src={slides[i]} alt={`Slide ${i + 1}`} onError={() => setGone((g) => ({ ...g, [slides[i]]: true }))} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
        {i > 0 && <button aria-label="Previous slide" onClick={() => setI(i - 1)} style={arrow("left")}>‹</button>}
        {i < slides.length - 1 && <button aria-label="Next slide" onClick={() => setI(i + 1)} style={arrow("right")}>›</button>}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 4, padding: 9 }}>{slides.map((s, k) => <button key={s} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} style={{ width: 7, height: 7, padding: 0, border: 0, borderRadius: 4, background: k === i ? "#262626" : "#c7c7c7", cursor: "pointer" }} />)}</div>
    </div>
  );
}

// 9:16 at phone size, with the areas the app's buttons and caption cover.
export function ReelPhone({ src, sheet }: { src: string; sheet?: string | null }) {
  const [safe, setSafe] = useState(false);
  const [gone, setGone] = useState(false);
  const zone = { position: "absolute" as const, background: "rgba(255,255,255,.22)", outline: "1px dashed rgba(255,255,255,.8)" };
  return (
    <div>
      <div style={{ position: "relative", width: 270, height: 480, borderRadius: 26, background: "#000", overflow: "hidden", boxShadow: "0 0 0 6px #10161b, 0 22px 44px rgba(11,27,39,.28)", margin: "6px" }}>
        {gone ? <Missing what="video" /> : <video src={src} controls playsInline onError={() => setGone(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
        {safe && <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{ ...zone, left: 0, right: 0, top: 0, height: "11%" }} />
          <div style={{ ...zone, left: 0, right: 0, bottom: 0, height: "21%" }} />
          <div style={{ ...zone, right: 0, top: "42%", bottom: "21%", width: "14%" }} />
        </div>}
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 10, fontSize: 12 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} /> Show what the app covers</label>
        {sheet && <a href={sheet} target="_blank" rel="noreferrer" style={{ color: C.deep, fontWeight: 600 }}>Frame sheet</a>}
      </div>
    </div>
  );
}

// The produced full episode: 16:9, with the frame sheet of its animated moments.
function EpisodeVideo({ src, sheet, width }: { src: string; sheet?: string | null; width?: number }) {
  const [gone, setGone] = useState(false);
  return (
    <div style={{ display: "grid", gap: 8, width: "100%", maxWidth: width ? Math.max(width, 480) : undefined }}>
      {gone ? <div style={{ aspectRatio: "16 / 9", borderRadius: 6, background: "#000" }}><Missing what="video" /></div>
        : <video src={src} controls playsInline preload="metadata" onError={() => setGone(true)} style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 6, background: "#000", display: "block" }} />}
      {sheet && <a href={sheet} target="_blank" rel="noreferrer" style={{ color: C.deep, fontWeight: 600, fontSize: 12 }}>Frame sheet</a>}
    </div>
  );
}

// What the piece looks like right now, in the feed it's going to.
export default function Preview({ p, width }: { p: ViewPiece; width?: number }) {
  // posted and cleared: the words stay, the video, slides and image are gone
  const cleared = p.media?.retention;
  if (cleared) return p.kind === "post" && p.body
    ? <div style={{ display: "grid", gap: 8 }}><LinkedInCard body={p.body} /><Cleared r={cleared} /></div>
    : <Cleared r={cleared} />;
  if (p.kind === "reel" && p.video_url) return <ReelPhone src={p.video_url} sheet={p.sheet_url} />;
  if (p.kind === "episode" && p.video_url) return <EpisodeVideo src={p.video_url} sheet={p.sheet_url} width={width} />;
  if ((p.kind === "reel" || p.kind === "carousel") && p.status === "making")
    return <pre style={{ whiteSpace: "pre-wrap", background: C.soft, borderRadius: 6, padding: 12, margin: 0, font: "12px/1.6 ui-monospace, Menlo, monospace", color: C.text }}>{p.media?.render_status || "Starting a cloud machine…"}</pre>;
  if ((p.kind === "reel" || p.kind === "carousel") && p.media?.render_error && !p.slide_urls?.length && !p.video_url) return <p style={{ color: C.warn, margin: 0, fontSize: 14 }}>{p.kind === "carousel" ? "The build failed." : "The render failed."} {p.media.render_status?.split("\n").slice(-3).join(" ")}</p>;
  if (p.kind === "carousel" && p.slide_urls?.length) return <InstaCarousel slides={p.slide_urls} width={width} />;
  if (p.kind === "post" && p.body) return <LinkedInCard body={p.body} image={p.image_url} />;
  return <p style={{ margin: 0, fontSize: 14, color: C.muted }}>Not made yet.</p>;
}
