"use client";
import { useEffect, useRef, useState } from "react";
import { C, HEAD, btn, hot, ghost, link, label, input, chip } from "../../lib/ui";
import { uploadFile } from "../../lib/upload";
import { minutes, scheduled, type Episode } from "../../lib/podcast";
import { OWNER, WEBSITE } from "../../lib/brand";

// the owner's site, for the placeholders and the blog page's address ("your site" when none is set)
const SITE_URL = (WEBSITE || "https://example.com").replace(/\/+$/, "");
const SITE = WEBSITE ? WEBSITE.replace(/^https?:\/\//i, "").replace(/\/.*$/, "") : "your site";

export type ViewEpisode = Episode & { audio_url: string | null; artwork_url: string | null; transcript_url: string | null };
export type Source = { path: string; name: string; size: number; type: string };
export type Sources = { audio: Source[]; transcripts: Source[] };

const area = { ...input, padding: 10, minHeight: 90, font: "14px/1.5 Poppins, Arial, sans-serif" } as const;
const mb = (n: number | null | undefined) => (!n ? "" : n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : `${(n / 1048576).toFixed(1)} MB`);
const SOURCE_KIND: Record<string, string> = { audio: "Audio", full: "Full episode video", clip: "Video" };

export async function api<T = Record<string, unknown>>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ error: `The app answered ${r.status}.` }));
  if (!r.ok || j.error) throw new Error(j.error ?? `The app answered ${r.status}.`);
  return j as T;
}

// Artwork and transcripts go straight into the public podcast bucket.
export async function putFile(file: File, episode?: string) {
  const r = await api<{ path: string; signedUrl: string }>("/api/podcast/upload-url", "POST", { name: file.name, episode });
  const fd = new FormData();
  fd.append("cacheControl", "31536000");
  fd.append("", file);
  const up = await fetch(r.signedUrl, { method: "PUT", body: fd });
  if (!up.ok) throw new Error(`Upload failed (${up.status}).`);
  return r.path;
}

// Apple's rule for cover art, checked before anything uploads.
export async function checkArt(file: File) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) throw new Error("Artwork is a JPG or PNG.");
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const { naturalWidth: w, naturalHeight: h } = img;
  URL.revokeObjectURL(img.src);
  if (w !== h || w < 1400 || w > 3000) throw new Error(`Apple needs a square image from 1400 to 3000 pixels. This one is ${w} x ${h}.`);
}

// ISO time to the value a datetime-local field shows (the viewer's own clock), and back.
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export function statusChip(e: Episode) {
  if (e.status === "published") return scheduled(e) ? { label: `Goes out ${when(e.published_at)}`, bg: "#198754", fg: "#fff" } : { label: "In the feed", bg: "#198754", fg: "#fff" };
  if (e.status === "ready") return { label: `Waiting for ${OWNER}`, bg: C.accent, fg: C.accentInk };
  return { label: "Draft", bg: "#fff", fg: C.ink, border: `1px solid ${C.hair}` };
}

type Form = { title: string; summary: string; notes: string; guest: string; guest_url: string; youtube_url: string; blog_url: string; slug: string; season: string; number: string; episode_type: string; explicit: boolean; published_at: string };
const formOf = (e: Episode): Form => ({
  title: e.title, summary: e.summary, notes: e.notes, guest: e.guest ?? "", guest_url: e.guest_url ?? "", youtube_url: e.youtube_url ?? "", blog_url: e.blog_url ?? "",
  slug: e.slug, season: e.season == null ? "" : String(e.season), number: e.number == null ? "" : String(e.number), episode_type: e.episode_type, explicit: e.explicit, published_at: toLocal(e.published_at),
});

export default function PodcastEpisode({ ep, canPublish, sources, onChange, onDelete }: { ep: ViewEpisode; canPublish: boolean; sources?: Sources | null; onChange: (e: ViewEpisode) => void; onDelete?: () => void }) {
  const [f, setF] = useState<Form>(formOf(ep));
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [said, setSaid] = useState("");
  const [pick, setPick] = useState(false);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  // A different episode, or new data from the server (a finished audio job), resets the fields.
  useEffect(() => { setF(formOf(ep)); }, [ep.id, ep.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = ep.audio_job?.status === "running";
  const changedRef = useRef(onChange);
  changedRef.current = onChange;
  // While the cloud machine works, check every 15 seconds; the server records the result the first time it sees it.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => api<{ episode: ViewEpisode }>(`/api/podcast/episodes/${ep.id}`).then((r) => { if (r.episode.audio_job?.status !== "running") changedRef.current(r.episode); }).catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [running, ep.id]);

  async function save(body: Record<string, unknown>, wait = "") {
    setErr(""); if (wait) setBusy(wait);
    try { onChange((await api<{ episode: ViewEpisode }>(`/api/podcast/episodes/${ep.id}`, "PATCH", body)).episode); return true; }
    catch (e) { setErr((e as Error).message); setF(formOf(ep)); return false; }
    finally { setBusy(""); }
  }
  // Saves one field when the team leaves it, only if it changed.
  const blur = (k: keyof Form) => () => {
    const v = f[k], old = formOf(ep)[k];
    if (v === old) return;
    save({ [k]: k === "published_at" ? (v ? new Date(String(v)).toISOString() : null) : v });
  };
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function chooseSource(path: string) {
    setErr(""); setBusy("Starting the audio…");
    try { await api(`/api/podcast/episodes/${ep.id}/audio`, "POST", { source: path }); setPick(false); onChange((await api<{ episode: ViewEpisode }>(`/api/podcast/episodes/${ep.id}`)).episode); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  }
  async function uploadAudio(file: File | undefined) {
    if (!file) return;
    setErr("");
    try { const path = await uploadFile(file, { episodeId: ep.episode_id ?? undefined }, (done, total) => setUpload({ done, total })); setUpload(null); await chooseSource(path); }
    catch (e) { setUpload(null); setErr((e as Error).message); }
  }
  async function writeNotes() {
    if ((f.summary || f.notes) && !window.confirm("Replace the summary and show notes with a new draft?")) return;
    setErr(""); setSaid(""); setBusy("Writing the show notes from the transcript (about a minute)…");
    try {
      const r = await api<{ summary: string; notes: string; note: string }>(`/api/podcast/episodes/${ep.id}/notes`, "POST");
      setBusy("");
      if (await save({ summary: r.summary, notes: r.notes })) setSaid(r.note ? `Note from the writer: ${r.note}` : `Draft written. Read it through before it goes to ${OWNER}.`);
    } catch (e) { setErr((e as Error).message); setBusy(""); }
  }
  async function art(file: File | undefined) {
    if (!file) return;
    setErr(""); setBusy("Uploading the artwork…");
    try { await checkArt(file); const path = await putFile(file, ep.id); setBusy(""); await save({ artwork_path: path }); }
    catch (e) { setErr((e as Error).message); setBusy(""); }
  }
  async function transcript(file: File | undefined) {
    if (!file) return;
    setErr(""); setBusy("Uploading the transcript…");
    try { const path = await putFile(file, ep.id); setBusy(""); await save({ transcript_path: path }); }
    catch (e) { setErr((e as Error).message); setBusy(""); }
  }
  async function remove() {
    if (!window.confirm("Throw this draft away? Its audio and artwork go with it.")) return;
    setBusy("Removing…");
    try { await api(`/api/podcast/episodes/${ep.id}`, "DELETE"); onDelete?.(); } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  }

  const st = statusChip(ep);
  const missing = [!ep.audio_path && "the audio", !(f.summary.trim() || f.notes.trim()) && "a summary or show notes"].filter(Boolean) as string[];
  const later = !!f.published_at && new Date(f.published_at).getTime() > Date.now();
  const fieldRow = { display: "grid", gap: 6 } as const;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={chip(st)}>{st.label}</span>
        {ep.status === "published" && !scheduled(ep) && <span style={{ fontSize: 12.5, color: C.muted }}>since {when(ep.published_at)}</span>}
        {onDelete && ep.status !== "published" && <button style={{ ...link, fontSize: 12.5, marginLeft: "auto", color: C.muted }} disabled={!!busy} onClick={remove}>Throw away this draft</button>}
      </div>

      {/* The sound comes first: nothing goes out without it. */}
      <div style={{ display: "grid", gap: 10, padding: 14, background: C.soft, borderRadius: 6 }}>
        <div style={label}>Audio</div>
        {running ? (
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            <b style={{ fontFamily: HEAD }}>Preparing the audio.</b> A cloud machine is turning it into the podcast file; a 45-minute episode takes about 3 minutes. You can leave this page.
            {ep.audio_job?.log && <div style={{ fontSize: 12, color: C.muted, marginTop: 4, whiteSpace: "pre-wrap" }}>{ep.audio_job.log.split("\n").pop()}</div>}
          </div>
        ) : ep.audio_url ? (
          <>
            <audio controls preload="none" src={ep.audio_url} style={{ width: "100%" }} />
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: C.text }}>
              <span>{minutes(ep.duration)} · {mb(ep.audio_bytes)} · {ep.audio_type === "audio/x-m4a" ? "M4A" : "MP3"}</span>
              <button style={{ ...link, fontSize: 12.5 }} disabled={!!busy || !!upload} onClick={() => setPick(!pick)}>{pick ? "Keep this audio" : "Use different audio"}</button>
            </div>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13.5, color: C.text }}>{ep.audio_job?.status === "failed" ? `The last try didn't work: ${ep.audio_job.log?.split("\n").pop() ?? "no detail"}. Pick the file again.` : "No audio yet. Pick the file the episode goes out with."}</p>
        )}
        {!running && (pick || !ep.audio_url) && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>
            {(sources?.audio ?? []).map((s) => (
              <button key={s.path} style={{ ...ghost, display: "grid", justifyItems: "start", justifyContent: "stretch", gap: 2, textAlign: "left", minWidth: 0, width: "100%", padding: "8px 14px" }} disabled={!!busy || !!upload} onClick={() => chooseSource(s.path)}>
                <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{SOURCE_KIND[s.type] ?? "File"} · {mb(s.size)}</span>
              </button>
            ))}
            <label style={{ ...ghost, cursor: busy || upload ? "not-allowed" : "pointer", opacity: busy || upload ? 0.55 : 1 }}>
              {upload ? `Uploading ${Math.round((upload.done / Math.max(upload.total, 1)) * 100)}%…` : "Upload the audio file"}
              <input type="file" hidden accept="audio/*,video/*" disabled={!!busy || !!upload} onChange={(e) => { uploadAudio(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.45 }}>A finished MP3 or M4A goes out as it is. A WAV or a video becomes a 128 kbps MP3 at podcast loudness (-16 LUFS).</p>
          </div>
        )}
      </div>

      <div style={fieldRow}>
        <label style={label} htmlFor={`t-${ep.id}`}>Title</label>
        <input id={`t-${ep.id}`} style={input} value={f.title} onChange={set("title")} onBlur={blur("title")} />
      </div>
      <div style={fieldRow}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <label style={label} htmlFor={`s-${ep.id}`}>Summary</label>
          <span style={{ fontSize: 12, color: f.summary.length > 300 ? C.warn : C.muted }}>{f.summary.length}/300</span>
          {ep.episode_id && <button style={{ ...link, fontSize: 13, marginLeft: "auto" }} disabled={!!busy} onClick={writeNotes}>Write the summary and notes for me</button>}
        </div>
        <textarea id={`s-${ep.id}`} style={{ ...area, minHeight: 70 }} value={f.summary} onChange={set("summary")} onBlur={blur("summary")} placeholder="One or two sentences. Podcast apps show this first; the website uses it as the teaser." />
      </div>
      <div style={fieldRow}>
        <label style={label} htmlFor={`n-${ep.id}`}>Show notes</label>
        <textarea id={`n-${ep.id}`} style={{ ...area, minHeight: 180 }} value={f.notes} onChange={set("notes")} onBlur={blur("notes")} placeholder={`Short paragraphs with a blank line between them.\n- A line starting with a dash is a list item\nLinks written out in full: ${SITE_URL}/`} />
      </div>
      {said && <div className="rise" style={{ fontSize: 13, lineHeight: 1.5, color: C.text }}>{said}</div>}

      <div className="two-up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={fieldRow}><label style={label} htmlFor={`g-${ep.id}`}>Guest</label><input id={`g-${ep.id}`} style={input} value={f.guest} onChange={set("guest")} onBlur={blur("guest")} placeholder="Leave empty for a solo episode" /></div>
        <div style={fieldRow}><label style={label} htmlFor={`gu-${ep.id}`}>Guest&apos;s link</label><input id={`gu-${ep.id}`} style={input} value={f.guest_url} onChange={set("guest_url")} onBlur={blur("guest_url")} placeholder="https://" /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        <div style={fieldRow}><label style={label} htmlFor={`se-${ep.id}`}>Season</label><input id={`se-${ep.id}`} style={input} inputMode="numeric" value={f.season} onChange={set("season")} onBlur={blur("season")} /></div>
        <div style={fieldRow}><label style={label} htmlFor={`nu-${ep.id}`}>Episode</label><input id={`nu-${ep.id}`} style={input} inputMode="numeric" value={f.number} onChange={set("number")} onBlur={blur("number")} /></div>
        <div style={fieldRow}>
          <label style={label} htmlFor={`ty-${ep.id}`}>Type</label>
          <select id={`ty-${ep.id}`} style={input} value={f.episode_type} onChange={(e) => { setF({ ...f, episode_type: e.target.value }); save({ episode_type: e.target.value }); }}>
            <option value="full">Full episode</option><option value="bonus">Bonus</option><option value="trailer">Trailer</option>
          </select>
        </div>
        <label style={{ ...fieldRow, alignContent: "end", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 8, fontSize: 14, minHeight: 44 }}>
          <input type="checkbox" checked={f.explicit} onChange={(e) => { setF({ ...f, explicit: e.target.checked }); save({ explicit: e.target.checked }); }} /> Explicit
        </label>
      </div>

      <div className="two-up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={fieldRow}>
          <div style={label}>Episode artwork</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {ep.artwork_url && <img src={ep.artwork_url} alt="" width={44} height={44} style={{ borderRadius: 4, objectFit: "cover" }} />}
            <label style={{ ...link, fontSize: 13 }}>{ep.artwork_url ? "Replace" : "Upload"}<input type="file" hidden accept="image/jpeg,image/png" disabled={!!busy} onChange={(e) => { art(e.target.files?.[0]); e.target.value = ""; }} /></label>
            {ep.artwork_url ? <button style={{ ...link, fontSize: 13, color: C.muted }} disabled={!!busy} onClick={() => save({ artwork_path: null })}>Use the show&apos;s</button> : <span style={{ fontSize: 12, color: C.muted }}>Uses the show&apos;s artwork</span>}
          </div>
        </div>
        <div style={fieldRow}>
          <div style={label}>Transcript</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
            {ep.transcript_url ? <a href={ep.transcript_url} target="_blank" rel="noreferrer" style={{ color: C.ink }}>In the feed</a> : <span style={{ color: C.muted }}>None</span>}
            {(sources?.transcripts ?? []).slice(0, 2).map((s) => <button key={s.path} style={{ ...link, fontSize: 13 }} disabled={!!busy} onClick={() => save({ transcript_from: s.path }, "Copying the transcript…")}>Use {s.name}</button>)}
            <label style={{ ...link, fontSize: 13 }}>Upload<input type="file" hidden accept=".srt,.vtt,.txt" disabled={!!busy} onChange={(e) => { transcript(e.target.files?.[0]); e.target.value = ""; }} /></label>
            {ep.transcript_url && <button style={{ ...link, fontSize: 13, color: C.muted }} disabled={!!busy} onClick={() => save({ transcript_path: null })}>Remove</button>}
          </div>
          <span style={{ fontSize: 12, color: C.muted }}>Only a transcript timed to the final audio (.srt or .vtt).</span>
        </div>
      </div>

      <div className="two-up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={fieldRow}><label style={label} htmlFor={`yt-${ep.id}`}>YouTube video</label><input id={`yt-${ep.id}`} style={input} value={f.youtube_url} onChange={set("youtube_url")} onBlur={blur("youtube_url")} placeholder="https://www.youtube.com/watch?v=" /></div>
        <div style={fieldRow}><label style={label} htmlFor={`bl-${ep.id}`}>Blog page on {SITE}</label><input id={`bl-${ep.id}`} style={input} value={f.blog_url} onChange={set("blog_url")} onBlur={blur("blog_url")} placeholder={`${SITE_URL}/blog/${f.slug}`} /></div>
      </div>
      <div style={fieldRow}>
        <label style={label} htmlFor={`sl-${ep.id}`}>Web address</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.muted }}>{SITE}/blog/<input id={`sl-${ep.id}`} style={{ ...input, flex: 1, width: "auto" }} value={f.slug} onChange={set("slug")} onBlur={blur("slug")} /></div>
        <span style={{ fontSize: 12, color: C.muted }}>The blog page is built from this episode once it&apos;s in the feed. Until the page exists, apps link to the website.</span>
      </div>

      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, display: "grid", gap: 10 }}>
        <label style={label} htmlFor={`d-${ep.id}`}>Goes out</label>
        <input id={`d-${ep.id}`} type="datetime-local" style={{ ...input, maxWidth: 280 }} value={f.published_at} onChange={set("published_at")} onBlur={blur("published_at")} />
        <span style={{ fontSize: 12, color: C.muted }}>Leave it empty and it goes out the moment {OWNER} publishes. A future time waits; the feed picks it up within 5 minutes of that time.</span>
        {err && <div role="alert" style={{ fontSize: 13.5, color: C.warn, lineHeight: 1.45 }}>{err}</div>}
        {busy && <div style={{ fontSize: 13.5, color: C.text }}>{busy}</div>}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {ep.status === "published" ? (
            canPublish && <button style={ghost} disabled={!!busy} onClick={() => window.confirm("Take this episode out of the feed? Apps stop showing it at their next check. Anyone who downloaded it keeps their copy.") && save({ action: "unpublish" }, "Taking it out…")}>Take it out of the feed</button>
          ) : canPublish ? (
            <>
              <button style={hot} disabled={!!busy || running || missing.length > 0} onClick={() => window.confirm(later ? `Schedule this episode for ${when(new Date(f.published_at).toISOString())}?` : "Put this episode in the feed now? Apple and Spotify pick it up at their next check.") && save({ action: "publish" }, "Publishing…")}>{later ? "Schedule it" : "Publish to the podcast"}</button>
              {ep.status === "ready" && <button style={{ ...link, fontSize: 13 }} disabled={!!busy} onClick={() => save({ action: "draft" })}>Back to draft</button>}
            </>
          ) : ep.status === "ready" ? (
            <>
              <span style={{ font: `700 14px ${HEAD}` }}>{OWNER} publishes it from here.</span>
              <button style={{ ...link, fontSize: 13 }} disabled={!!busy} onClick={() => save({ action: "draft" })}>Back to draft</button>
            </>
          ) : (
            <button style={btn} disabled={!!busy || running || missing.length > 0} onClick={() => save({ action: "ready" })}>Ready for {OWNER}</button>
          )}
          {missing.length > 0 && ep.status !== "published" && <span style={{ fontSize: 12.5, color: C.muted }}>Still needs {missing.join(" and ")}.</span>}
        </div>
      </div>
    </div>
  );
}
