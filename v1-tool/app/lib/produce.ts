import { db, storage } from "./supabase";
import { episodeFeeds, pairInput, people, stackPair } from "./feeds";
import { startFullEdit } from "./render";

// Start the produced full episode on a cloud machine (the episode engine): from the "Make the full episode" button, and
// on its own once an episode's camera tracks are transcribed.
// start/end: seconds on the recording's clock (optional); notes: the team's notes for this episode's editor.
export async function produceEpisode(id: string, opts: { start?: number; end?: number; notes?: string; claimed?: boolean } = {}) {
  const sb = db();
  const { data: ep, error } = await sb.from("studio_episodes").select("id, title, guest, show, full_edit").eq("id", id).single();
  if (error) throw error;
  if (ep.full_edit?.status === "running" && !opts.claimed) return ep.full_edit;
  const feeds = await episodeFeeds(id);
  const inp = pairInput(feeds);
  if (!inp.top) throw new RangeError("Add the camera feeds first.");
  const notes = opts.notes ?? String(ep.full_edit?.notes ?? "");
  const show = String(ep.show ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // the newest episode editor, the newest saved word times, the owner's rules, the material (for screen shares), the show's ad read
  const [{ data: up }, { data: wl }, { data: rules }, { data: material }, { data: ads }] = await Promise.all([
    storage().list("uploads", { limit: 100, sortBy: { column: "created_at", order: "desc" } }),
    storage().list(`episodes/${id}/words`, { limit: 20, sortBy: { column: "created_at", order: "desc" } }),
    sb.from("studio_rules").select("body").eq("status", "active").order("created_at"),
    storage().list(`episodes/${id}`, { limit: 200 }),
    show ? storage().list(`ads/${show}`, { limit: 20, sortBy: { column: "created_at", order: "desc" } }) : Promise.resolve({ data: [] }),
  ]);
  const engine = (up ?? []).find((f) => /episode-engine.*\.tgz$/.test(f.name));
  if (!engine) throw new RangeError("The episode editor file isn't uploaded.");
  const words = (wl ?? []).find((f) => f.id && f.name.endsWith(".json"));
  const ad = (ads ?? []).find((f) => f.id && /\.(mp4|mov|m4v|webm)$/i.test(f.name));
  // Riverside's screen shares ("alex-screen_5_06-26-2026_121606-1.mp4") start partway into the recording: the clock in the
  // name, minus the same person's camera clock ("alex_5_06-26-2026_121355-1.mp4"), is where they play as B-roll
  const clockOf = (name: string) => { const m = name.match(/_(\d+)_(\d{2}-\d{2}-\d{4})_(\d{2})(\d{2})(\d{2})/); return m ? { date: m[2], s: +m[3] * 3600 + +m[4] * 60 + +m[5] } : null; };
  const broll = (material ?? []).filter((f) => f.id && /-screen_\d+_.*\.(mp4|mov|webm|mkv)$/i.test(f.name)).map((f) => {
    const who = f.name.replace(/^\d+-/, "").match(/^(.+?)-screen_/)?.[1] ?? "";
    const sc = clockOf(f.name);
    const cam = feeds.find((x) => x.kind === "video" && x.name.toLowerCase().startsWith(`${who.toLowerCase()}_`));
    const cc = cam ? clockOf(cam.name) : null;
    return sc && cc && sc.date === cc.date && sc.s >= cc.s ? { path: `episodes/${id}/${f.name}`, offset: sc.s - cc.s } : null;
  }).filter(Boolean) as { path: string; offset: number }[];
  const { top, bottom } = stackPair(people(feeds));
  const path = `episodes/${id}/full/${Date.now()}-full-edit.mp4`;
  const job = await startFullEdit(inp, { top: top?.person, bottom: bottom?.person }, path, {
    start: opts.start, end: opts.end, engine: `uploads/${engine.name}`, words: words ? `episodes/${id}/words/${words.name}` : undefined,
    broll, ad: ad ? `ads/${show}/${ad.name}` : undefined,
    context: { episode: { title: ep.title, guest: ep.guest, show: ep.show }, notes: notes || undefined, rules: (rules ?? []).map((r) => r.body) },
  });
  const full_edit = { status: "running", job, path, at: new Date().toISOString(), start: opts.start ?? null, end: opts.end ?? null, notes: notes || null, produced: true };
  const upd = await sb.from("studio_episodes").update({ full_edit }).eq("id", id);
  if (upd.error) throw upd.error;
  return full_edit;
}

// The produced episode starts on its own for a recent episode (two weeks) with camera feeds and exact word times (the
// camera tracks' transcript, or captions) that hasn't had one: one request claims it, so two open tabs start one job.
export async function autoProduce(ep: { id: string; created_at: string; full_edit?: { status?: string; produced?: boolean } | null; kind?: string | null }, exact: boolean, cams: boolean) {
  if (!exact || !cams || ep.kind === "idea" || ep.full_edit?.produced || ep.full_edit?.status === "running") return false;
  if (Date.now() - new Date(ep.created_at).getTime() > 14 * 86400000) return false;
  const claim = { ...(ep.full_edit ?? {}), status: "running", job: "", log: "starting the editor", at: new Date().toISOString(), produced: true };
  let q = db().from("studio_episodes").update({ full_edit: claim }).eq("id", ep.id);
  q = ep.full_edit ? q.filter("full_edit->>status", "eq", ep.full_edit.status ?? "") : q.is("full_edit", null);
  const { data } = await q.select("id");
  if (!data?.length) return false;
  try {
    await produceEpisode(ep.id, { claimed: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db().from("studio_episodes").update({ full_edit: { ...claim, status: "failed", log: `FAILED to start: ${msg.slice(0, 200)}` } }).eq("id", ep.id);
  }
  return true;
}
