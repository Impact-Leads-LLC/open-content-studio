"use client";
import { useCallback, useEffect, useState } from "react";
import { C, HEAD, btn, ghost, link, card, label, input, chip } from "../../lib/ui";
import { CATEGORIES, PLATFORMS, minutes, live, scheduled, slugify, type Category, type Check, type Show } from "../../lib/podcast";
import PodcastEpisode, { api, putFile, checkArt, statusChip, type ViewEpisode } from "../components/PodcastEpisode";
import { OWNER, WEBSITE } from "../../lib/brand";

// an example of the feed's own address, on the owner's domain ("podcast.example.com" when no site is set)
const FEED_EXAMPLE = `podcast.${WEBSITE ? WEBSITE.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "") : "example.com"}`;

type Card = { slug: string; title: string; artwork_url: string | null; feed_url: string };
type Data = { show: Show | null; shows: Card[]; artwork_url: string | null; feed_url: string; fallback_base: string; episodes: ViewEpisode[]; studio: Record<string, string>; checks: Check[]; can_publish: boolean };
type Apple = { found: boolean; feed?: string; follows?: boolean; episodes?: number; ours?: number; latest?: string } | null;

const area = { ...input, padding: 10, minHeight: 120, font: "14px/1.5 Poppins, Arial, sans-serif" } as const;
const dot = (ok: boolean) => ({ width: 9, height: 9, borderRadius: 5, flexShrink: 0, marginTop: 6, background: ok ? "#198754" : C.warn });
const section = { ...card, padding: "20px 22px", display: "grid", gap: 14 } as const;
const h2 = { margin: 0, font: `800 18px ${HEAD}`, letterSpacing: "-0.01em" } as const;

export default function Podcast() {
  const [d, setD] = useState<Data | null>(null);
  const [apple, setApple] = useState<Apple>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  // The show on screen is in the address (?show=<feed name>); without one, the first show. Null until it's read.
  const [slug, setSlug] = useState<string | null>(null);
  const qs = slug ? `?show=${encodeURIComponent(slug)}` : "";
  const load = useCallback(() => api<Data>(`/api/podcast${qs}`).then((r) => { setD(r); setErr(""); }).catch((e) => setErr(e.message)), [qs]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setSlug(q.get("show") ?? "");
    const ep = q.get("ep");
    if (ep) setOpen(ep);
  }, []);
  useEffect(() => {
    if (slug === null) return;
    load();
    setApple(null);
    api<{ apple: Apple }>(`/api/podcast/platforms${qs}`).then((r) => setApple(r.apple)).catch(() => {});
  }, [slug, qs, load]);
  function pickShow(s: string) {
    setD(null); setOpen(null); setAdding(false); setErr(""); setSlug(s);
    window.history.replaceState(null, "", `/podcast?show=${encodeURIComponent(s)}`);
  }
  // Keep the page current while audio is being brought over.
  const running = !!d?.episodes.some((e) => e.audio_job?.status === "running");
  useEffect(() => { if (!running) return; const t = setInterval(load, 20000); return () => clearInterval(t); }, [running, load]);
  const onChange = useCallback((e: ViewEpisode) => setD((x) => (x ? { ...x, episodes: x.episodes.map((y) => (y.id === e.id ? e : y)) } : x)), []);

  async function saveShow(body: Record<string, unknown>, wait = "") {
    setErr(""); if (wait) setBusy(wait);
    try { await api(`/api/podcast${d?.show ? `?show=${encodeURIComponent(d.show.slug)}` : qs}`, "PATCH", body); await load(); return true; } catch (e) { setErr((e as Error).message); return false; } finally { setBusy(""); }
  }
  async function bringOver() {
    setErr(""); setBusy("Starting the cloud machine…");
    try { const r = await api<{ audio: number; art: number }>("/api/podcast", "POST", { action: "bring-over", show: d?.show?.slug }); setBusy(""); await load(); if (!r.audio && !r.art) setErr("Nothing left to bring over."); }
    catch (e) { setErr((e as Error).message); setBusy(""); }
  }
  async function showArt(file: File | undefined) {
    if (!file) return;
    setErr(""); setBusy("Uploading the artwork…");
    try { await checkArt(file); const path = await putFile(file); await saveShow({ artwork_path: path }); } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  }

  if (err && !d) return <main style={{ maxWidth: 960, margin: "0 auto", padding: 24, color: C.warn }}>{err}</main>;
  if (!d) return <main style={{ maxWidth: 960, margin: "0 auto", padding: 24, color: C.muted }}>Loading the podcast…</main>;
  const feedFor = (s: string) => (d.feed_url ?? d.shows[0]?.feed_url ?? "/feed/x.xml").replace(/[^/]+\.xml$/, `${s}.xml`);
  if (!d.show) return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24, display: "grid", gap: 16 }}>
      {err && <div role="alert" style={{ color: C.warn, fontSize: 14 }}>{err}</div>}
      {slug && d.shows.length ? <p style={{ margin: 0 }}>There&apos;s no show called {slug}. <button style={link} onClick={() => pickShow(d.shows[0].slug)}>Open {d.shows[0].title}</button></p> : null}
      {!d.shows.length && (d.can_publish ? <AddShow feedFor={feedFor} onDone={pickShow} /> : <p style={{ margin: 0 }}>No show is set up yet.</p>)}
    </main>
  );
  const show = d.show;
  const eps = d.episodes;
  const inFeed = eps.filter((e) => live(e)).length, waiting = eps.filter((e) => scheduled(e)).length, drafts = eps.filter((e) => e.status !== "published").length;
  const pending = eps.filter((e) => !e.audio_path && e.audio_job?.status !== "running" && typeof e.source?.audio === "string").length;
  const failing = d.checks.filter((c) => !c.ok);
  const ownDomain = !d.feed_url.includes(".vercel.app");
  // Moving off the old host, in order. Ticks the app can see for itself are automatic; the rest the owner ticks.
  const move = [
    { id: "audio", label: "Every episode's audio is here", auto: eps.length > 0 && eps.every((e) => !!e.audio_path) },
    { id: "check", label: "The feed passes every check", auto: failing.length === 0 },
    { id: "domain", label: `The feed lives on ${OWNER}'s own address (like ${FEED_EXAMPLE})`, auto: ownDomain },
    { id: "redirect", label: "The old host sends listeners here (a 301 redirect to the new feed, set at the old host)", manual: true },
    { id: "apple", label: "Apple reads the new feed", auto: !!apple?.follows },
    { id: "spotify", label: "Spotify reads the new feed (Spotify for Creators, Settings, check the RSS link)", manual: true },
    { id: "cancel", label: "The old host cancelled, at least 30 days after the redirect", manual: true },
  ];
  const sorted = [...eps].sort((a, b) => (b.published_at ?? "9").localeCompare(a.published_at ?? "9"));

  return (
    <>
      <section style={{ background: C.navy, color: "#fff" }}>
        {(d.shows.length > 1 || d.can_publish) && (
          <nav aria-label="Shows" style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px 0", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {d.shows.map((s) => {
              const on = s.slug === show.slug;
              return <button key={s.slug} onClick={() => !on && pickShow(s.slug)} aria-current={on ? "page" : undefined} style={{ minHeight: 36, padding: "0 14px", borderRadius: 6, border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.28)"}`, background: on ? "#fff" : "transparent", color: on ? C.ink : "#fff", font: `600 13px ${HEAD}`, cursor: on ? "default" : "pointer" }}>{s.title}</button>;
            })}
            {d.can_publish && !adding && <button onClick={() => setAdding(true)} style={{ ...link, color: "#fff", fontSize: 13, marginLeft: 6 }}>Add a show</button>}
          </nav>
        )}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 24px", display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          {d.artwork_url && <img src={d.artwork_url} alt="" width={84} height={84} style={{ borderRadius: 6, objectFit: "cover" }} />}
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div style={{ ...label, color: C.onNavy }}>Podcast</div>
            <h1 style={{ margin: "4px 0 8px", font: `800 28px/1.15 ${HEAD}`, letterSpacing: "-0.02em" }}>{show.title}</h1>
            <div style={{ fontSize: 13.5, color: C.onNavy }}>{inFeed} in the feed{waiting ? ` · ${waiting} scheduled` : ""}{drafts ? ` · ${drafts} not out yet` : ""}</div>
          </div>
          <div style={{ flex: "1 1 340px", minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}>
            <div style={{ ...label, color: C.onNavy }}>The feed&apos;s address</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
              <code style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: C.navy2, padding: "10px 12px", borderRadius: 6, fontSize: 13 }}>{d.feed_url}</code>
              <button style={{ ...ghost, minHeight: 40 }} onClick={() => { navigator.clipboard.writeText(d.feed_url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}>{copied ? "Copied" : "Copy"}</button>
              <a href={d.feed_url} target="_blank" rel="noreferrer" style={{ color: "#fff", font: `600 13px ${HEAD}` }}>Open</a>
            </div>
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 64px", display: "grid", gap: 20 }}>
        {err && <div role="alert" style={{ ...card, padding: "12px 16px", color: C.warn, fontSize: 14 }}>{err}</div>}
        {busy && <div style={{ ...card, padding: "12px 16px", fontSize: 14 }}>{busy}</div>}
        {adding && <AddShow feedFor={feedFor} onDone={pickShow} onCancel={() => setAdding(false)} />}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, alignItems: "start" }}>
          <section style={section}>
            <h2 style={h2}>Feed check</h2>
            {failing.length === 0 ? <p style={{ margin: 0, fontSize: 14 }}>Everything Apple and Spotify ask for is in place.</p> : <p style={{ margin: 0, fontSize: 14 }}>{failing.length} to fix before the feed goes public.</p>}
            <div style={{ display: "grid", gap: 8 }}>
              {[...failing, ...d.checks.filter((c) => c.ok)].map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.45 }}>
                  <span style={dot(c.ok)} />
                  <span><b style={{ fontFamily: HEAD, fontWeight: 600 }}>{c.label}</b>{c.episode ? `: ${c.episode}` : ""}{!c.ok && c.detail ? <span style={{ color: C.muted }}> {c.detail}</span> : null}</span>
                </div>
              ))}
            </div>
          </section>

          {show.move.from_feed !== undefined && show.move.cancel !== "done" && (
            <section style={section}>
              <h2 style={h2}>Moving off the old host</h2>
              <p style={{ margin: 0, fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>In this order. The redirect comes only after the feed is on {OWNER}&apos;s own address, so listeners move once.</p>
              <div style={{ display: "grid", gap: 10 }}>
                {move.map((m, i) => {
                  const ok = m.manual ? show.move[m.id] === "done" : !!m.auto;
                  return (
                    <div key={m.id} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.45, alignItems: "flex-start" }}>
                      <span style={{ ...chip({ label: "", bg: ok ? "#198754" : "#fff", fg: ok ? "#fff" : C.ink, border: ok ? undefined : `1px solid ${C.hair}` }), minWidth: 26, justifyContent: "center" }}>{i + 1}</span>
                      <span style={{ flex: 1, color: ok ? C.muted : C.ink }}>{m.label}</span>
                      {m.manual && d.can_publish && <button style={{ ...link, fontSize: 12.5 }} onClick={() => saveShow({ move: { [m.id]: ok ? "" : "done" } })}>{ok ? "Undo" : "Done"}</button>}
                    </div>
                  );
                })}
              </div>
              {pending > 0 && <button style={{ ...btn, justifySelf: "start" }} disabled={!!busy} onClick={bringOver}>Bring the audio over ({pending})</button>}
              {running && <p style={{ margin: 0, fontSize: 13, color: C.text }}>Bringing the audio over. This page updates on its own.</p>}
            </section>
          )}
        </div>

        <section style={section}>
          <h2 style={h2}>Episodes</h2>
          <div style={{ display: "grid" }}>
            {sorted.map((e) => {
              const st = statusChip(e);
              const isOpen = open === e.id;
              return (
                <div key={e.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <button onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen} style={{ width: "100%", background: "none", border: 0, padding: "12px 4px", display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 12, alignItems: "center", textAlign: "left", cursor: "pointer", color: C.ink }}>
                    {e.artwork_url || d.artwork_url ? <img src={e.artwork_url || d.artwork_url!} alt="" width={44} height={44} style={{ borderRadius: 4, objectFit: "cover" }} /> : <span />}
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", font: `700 14.5px/1.3 ${HEAD}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.number != null ? `${e.number}. ` : ""}{e.title}</span>
                      <span style={{ display: "block", fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                        {e.published_at ? new Date(e.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No date"}
                        {e.duration ? ` · ${minutes(e.duration)}` : ""}
                        {e.audio_job?.status === "running" ? " · audio on its way" : !e.audio_path ? " · no audio yet" : ""}
                        {e.episode_id && d.studio[e.episode_id] ? " · made in the studio" : ""}
                      </span>
                    </span>
                    <span style={chip(st)}>{st.label}</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: "4px 4px 22px" }}>
                      {e.episode_id && <a href={`/episodes/${e.episode_id}`} style={{ ...link, fontSize: 13, display: "inline-block", marginBottom: 12 }}>Open it in the studio, with its files and transcript</a>}
                      <PodcastEpisode ep={e} canPublish={d.can_publish} onChange={onChange} onDelete={() => { setOpen(null); load(); }} />
                    </div>
                  )}
                </div>
              );
            })}
            {!sorted.length && <p style={{ margin: 0, fontSize: 14, color: C.muted }}>No episodes yet. Start one from a studio episode&apos;s Full episode tab{d.shows.length > 1 ? `, and pick ${show.title} there` : ""}.</p>}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: C.muted }}>New episodes start in the studio: open the episode, go to Full episode, and use the Podcast step there.</p>
        </section>

        <section style={section}>
          <h2 style={h2}>Where it&apos;s listed</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>Each place is given the feed&apos;s address once and then checks it on its own. Paste each listing&apos;s link here so the website and the team have them.</p>
          <div style={{ display: "grid" }}>
            {PLATFORMS.map((p) => (
              <div key={p.id} style={{ borderTop: `1px solid ${C.line}`, padding: "12px 0", display: "grid", gridTemplateColumns: "minmax(140px, 200px) minmax(0, 1fr)", gap: 12, alignItems: "start" }} className="two-up">
                <div>
                  <div style={{ font: `700 14px ${HEAD}` }}>{p.name}</div>
                  <a href={p.manage} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 12.5 }}>Manage</a>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <input style={input} defaultValue={show.platforms[p.id]?.url ?? ""} placeholder="Listing link, https://" onBlur={(ev) => { const v = ev.target.value.trim(); if (v !== (show.platforms[p.id]?.url ?? "")) saveShow({ platforms: { [p.id]: { url: v } } }); }} />
                  <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{p.how}</span>
                  {p.id === "apple" && apple && (
                    <span style={{ fontSize: 12.5, lineHeight: 1.45, color: apple.follows ? "#198754" : C.text }}>
                      {!apple.found ? "Apple's directory doesn't know this listing." : apple.follows ? `Apple reads this feed and lists ${apple.episodes} episodes.` : `Apple still reads ${apple.feed} (${apple.episodes} episodes).`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <ShowSettings show={show} artworkUrl={d.artwork_url} fallback={d.fallback_base} isOwner={d.can_publish} busy={!!busy} save={saveShow} onArt={showArt} />
      </main>
    </>
  );
}

// A second (third…) show: its own feed on the same address, its own episodes, artwork and listings. The feed name is
// part of the feed's address, so it's set once here and never changes.
function AddShow({ feedFor, onDone, onCancel }: { feedFor: (slug: string) => string; onDone: (slug: string) => void; onCancel?: () => void }) {
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const slug = (name || title).trim() ? slugify(name || title) : "";
  async function create() {
    setBusy(true); setErr("");
    try { const r = await api<{ show: Show }>("/api/podcast", "POST", { action: "create-show", title, slug }); onDone(r.show.slug); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <section style={section}>
      <h2 style={h2}>Add a show</h2>
      <p style={{ margin: 0, fontSize: 13.5, color: C.text, lineHeight: 1.5 }}>The new show gets its own feed next to the others, your owner details from the first show, and its own episodes, artwork and listings. The description, artwork and category are filled in on its page once it&apos;s made.</p>
      <div className="two-up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}><label style={label} htmlFor="ns">Show title</label><input id="ns" style={input} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div style={{ display: "grid", gap: 6 }}><label style={label} htmlFor="nn">Name in the feed address</label><input id="nn" style={input} value={name} placeholder={title.trim() ? slugify(title) : "Taken from the title"} onChange={(e) => setName(e.target.value)} /></div>
      </div>
      {slug && (
        <div style={{ display: "grid", gap: 4, fontSize: 13.5, minWidth: 0 }}>
          <span style={{ overflowWrap: "anywhere" }}>Feed: <code>{feedFor(slug)}</code></span>
          <span style={{ fontSize: 12, color: C.muted }}>This address never changes once Apple and Spotify have it, so pick the name you&apos;ll keep.</span>
        </div>
      )}
      {err && <div role="alert" style={{ fontSize: 13.5, color: C.warn }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={btn} disabled={busy || !title.trim() || !slug} onClick={create}>{busy ? "Making the show…" : "Make the show"}</button>
        {onCancel && <button style={ghost} onClick={onCancel}>Cancel</button>}
      </div>
    </section>
  );
}

function ShowSettings({ show, artworkUrl, fallback, isOwner, busy, save, onArt }: { show: Show; artworkUrl: string | null; fallback: string; isOwner: boolean; busy: boolean; save: (b: Record<string, unknown>, wait?: string) => Promise<boolean>; onArt: (f: File | undefined) => void }) {
  const [s, setS] = useState(show);
  useEffect(() => setS(show), [show]);
  const text = (k: keyof Show) => ({
    value: String(s[k] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value }),
    onBlur: () => { if (String(s[k] ?? "") !== String(show[k] ?? "")) save({ [k]: s[k] ?? "" }); },
  });
  const cats: Category[] = [s.categories[0] ?? { category: "" }, s.categories[1] ?? { category: "" }];
  const setCat = (i: number, c: Category) => {
    const next = cats.map((x, j) => (j === i ? c : x)).filter((x) => x.category);
    setS({ ...s, categories: next });
    save({ categories: next });
  };
  const row = { display: "grid", gap: 6 } as const;
  return (
    <section style={section}>
      <h2 style={h2}>Show settings</h2>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {artworkUrl ? <img src={artworkUrl} alt="Show artwork" width={120} height={120} style={{ borderRadius: 6, objectFit: "cover" }} /> : <div style={{ width: 120, height: 120, borderRadius: 6, background: C.soft }} />}
        <div style={{ display: "grid", gap: 6 }}>
          <div style={label}>Artwork</div>
          <label style={{ ...ghost, cursor: "pointer" }}>{artworkUrl ? "Replace the artwork" : "Upload the artwork"}<input type="file" hidden accept="image/jpeg,image/png" disabled={busy} onChange={(e) => { onArt(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <span style={{ fontSize: 12, color: C.muted }}>Square JPG or PNG, 1400 to 3000 pixels.</span>
        </div>
      </div>
      <div className="two-up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={row}><label style={label} htmlFor="st">Title</label><input id="st" style={input} {...text("title")} /></div>
        <div style={row}><label style={label} htmlFor="sa">Host</label><input id="sa" style={input} {...text("author")} /></div>
      </div>
      <div style={row}><label style={label} htmlFor="sd">Description</label><textarea id="sd" style={area} {...text("description")} /><span style={{ fontSize: 12, color: s.description.length > 4000 ? C.warn : C.muted }}>{s.description.length}/4000. Paragraphs split by a blank line.</span></div>
      <div className="two-up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {cats.map((c, i) => (
          <div key={i} style={row}>
            <div style={label}>{i ? "Second category (optional)" : "Category"}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <select style={{ ...input, flex: 1 }} value={c.category} onChange={(e) => setCat(i, { category: e.target.value })} aria-label={`Category ${i + 1}`}>
                <option value="">{i ? "None" : "Pick one"}</option>
                {Object.keys(CATEGORIES).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              {!!CATEGORIES[c.category]?.length && (
                <select style={{ ...input, flex: 1 }} value={c.sub ?? ""} onChange={(e) => setCat(i, { category: c.category, sub: e.target.value || undefined })} aria-label={`Subcategory ${i + 1}`}>
                  <option value="">No subcategory</option>
                  {CATEGORIES[c.category].map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="two-up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={row}><label style={label} htmlFor="on">Owner name</label><input id="on" style={input} {...text("owner_name")} /></div>
        <div style={row}><label style={label} htmlFor="oe">Owner email</label><input id="oe" style={input} {...text("owner_email")} /><span style={{ fontSize: 12, color: C.muted }}>Apple and Spotify send ownership codes here.</span></div>
        <div style={row}><label style={label} htmlFor="sw">Website</label><input id="sw" style={input} {...text("website")} /></div>
        <div style={row}><label style={label} htmlFor="sc">Copyright</label><input id="sc" style={input} {...text("copyright")} /></div>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 14 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={s.explicit} onChange={(e) => { setS({ ...s, explicit: e.target.checked }); save({ explicit: e.target.checked }); }} /> Explicit</label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Order
          <select style={{ ...input, width: "auto", minHeight: 36 }} value={s.show_type} onChange={(e) => { setS({ ...s, show_type: e.target.value as Show["show_type"] }); save({ show_type: e.target.value }); }}>
            <option value="episodic">Newest first (episodic)</option><option value="serial">In order (serial)</option>
          </select>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={s.op3} onChange={(e) => { setS({ ...s, op3: e.target.checked }); save({ op3: e.target.checked }); }} /> Count downloads with OP3</label>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>OP3 is a free, open download counter that sits in front of each audio link. Its numbers are public at op3.dev. Apple Podcasts Connect and Spotify for Creators show their own numbers either way.</p>

      <details style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <summary style={{ ...label, cursor: "pointer" }}>Where the feed lives ({OWNER})</summary>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div style={row}>
            <label style={label} htmlFor="fb">The feed&apos;s home</label>
            <input id="fb" style={input} disabled={!isOwner} placeholder={fallback} {...text("feed_base")} />
            <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>Set this once the custom address works (for example https://{FEED_EXAMPLE}) and before anyone is given the feed. After that it never changes.</span>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}><input type="checkbox" disabled={!isOwner} checked={s.locked} onChange={(e) => { setS({ ...s, locked: e.target.checked }); save({ locked: e.target.checked }); }} /> Locked: other hosts can&apos;t import the show without {OWNER}&apos;s email</label>
          <div style={row}>
            <label style={label} htmlFor="nf">Moving the show to another host</label>
            <input id="nf" style={input} disabled={!isOwner} placeholder="Empty unless the show is leaving" {...text("new_feed_url")} />
            <span style={{ fontSize: 12, color: C.warn, lineHeight: 1.45 }}>Filling this in tells every app to follow the show to that address.</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>Show id: {show.podcast_guid}</div>
        </div>
      </details>
    </section>
  );
}
