"use client";
import { useCallback, useEffect, useState } from "react";
import { C, HEAD, btn, link, label, input } from "../../lib/ui";
import Glyph from "./Glyph";
import { WEBSITE } from "../../lib/brand";
import PodcastEpisode, { api, type ViewEpisode, type Sources } from "./PodcastEpisode";

// the owner's site by its host name ("example.com"), or "your site" when none is set
const SITE = WEBSITE ? WEBSITE.replace(/^https?:\/\//i, "").replace(/\/.*$/, "") : "your site";

type Data = { show: { title: string; slug: string; feed_url: string } | null; shows: { slug: string; title: string }[]; episode: ViewEpisode | null; sources: Sources; can_publish: boolean };

// The podcast step inside a studio episode's Full episode piece: the same episode, its files and transcript, one
// place to put it in the feed. The show itself is set up on /podcast.
export default function PodcastPublish({ episodeId }: { episodeId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");
  const load = useCallback(() => api<Data>(`/api/podcast/episodes?studio=${episodeId}`).then((r) => { setD(r); setPick(r.show?.slug ?? ""); }).catch((e) => setErr(e.message)), [episodeId]);
  useEffect(() => { load(); }, [load]);
  const onChange = useCallback((e: ViewEpisode) => setD((x) => (x ? { ...x, episode: e } : x)), []);

  async function start() {
    setBusy(true); setErr("");
    try { await api("/api/podcast/episodes", "POST", { episode_id: episodeId, show: pick }); await load(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Glyph kind="episode" size={18} />
        <span style={{ ...label, color: C.ink }}>Podcast{d?.show ? ` · ${d.show.title}` : ""}</span>
        <a href={d?.show ? `/podcast?show=${d.show.slug}` : "/podcast"} style={{ ...link, fontSize: 13, marginLeft: "auto" }}>Podcast page</a>
      </div>
      {err && <div role="alert" style={{ fontSize: 13.5, color: C.warn }}>{err}</div>}
      {!d && !err && <div style={{ fontSize: 13.5, color: C.muted }}>Loading…</div>}
      {d && !d.show && <p style={{ margin: 0, fontSize: 13.5 }}>The show isn&apos;t set up yet. <a href="/podcast" style={{ color: C.ink }}>Set it up on the Podcast page.</a></p>}
      {d?.show && !d.episode && (
        <div style={{ display: "grid", gap: 10, padding: 14, background: C.soft, borderRadius: 6 }}>
          {d.shows.length > 1 && (
            <label style={{ display: "grid", gap: 6, maxWidth: 420 }}>
              <span style={label}>Which show</span>
              <select style={input} value={pick} onChange={(e) => setPick(e.target.value)}>
                {d.shows.map((s) => <option key={s.slug} value={s.slug}>{s.title}</option>)}
              </select>
            </label>
          )}
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>Put this episode on <b style={{ fontFamily: HEAD }}>{d.shows.find((s) => s.slug === pick)?.title ?? d.show.title}</b>: the audio, show notes and artwork go into the feed that Apple, Spotify and the rest read, and the episode later becomes a blog page on {SITE}.</p>
          <button style={{ ...btn, justifySelf: "start" }} disabled={busy} onClick={start}>{busy ? "Starting…" : "Start the podcast episode"}</button>
        </div>
      )}
      {d?.show && d.episode && <PodcastEpisode ep={d.episode} canPublish={d.can_publish} sources={d.sources} onChange={onChange} onDelete={load} />}
    </section>
  );
}
