// studio-brain: the content studio's brain connector, an MCP server over HTTP (stateless JSON-RPC) that answers the
// tools the studio's prompts call. It reads the brain tables in this project (supabase/schema.sql): brain_documents,
// brain_assets and brain_asset_usage, plus studio_pieces for recent_content. BRAIN.md has the contract.
//
//   URL:   https://<project-ref>.supabase.co/functions/v1/studio-brain/mcp
//   Auth:  "Authorization: Bearer <token>" (or .../studio-brain/mcp/<token>), where <token> is one of the comma-separated
//          values in the secret STUDIO_BRAIN_TOKENS (supabase secrets set STUDIO_BRAIN_TOKENS=...).
//   Deploy with JWT checks off (the token is the auth): supabase functions deploy studio-brain --no-verify-jwt
//
// Read-only, except photo_use and thumb_use, which only record which photos a post used (for the rotation).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Optional secrets: STUDIO_BRAIN_NAME (the name
// clients show), STUDIO_BRAIN_CONFIDENTIAL=label (serve confidential documents, clearly labelled; by default they are
// never served).
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const assets = sb.storage.from("brain-assets");
const SERVER = { name: "studio-brain", title: Deno.env.get("STUDIO_BRAIN_NAME") || "Studio brain", version: "1.0.0" };
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const CONFIDENTIAL = (Deno.env.get("STUDIO_BRAIN_CONFIDENTIAL") ?? "").trim().toLowerCase() === "label";
const HOOK_TYPES = ["skeptic", "verdict", "warning", "number", "secret", "smirk", "how"];

const INSTRUCTIONS = `The content studio's brain. Before writing anything, call get_brand_brief and follow the voice and the
voice guardrails exactly; the brain wins over anything else. Find knowledge with brain_search and read it with
brain_get_document. Rules: a document marked confidential is never quoted; a document tagged guest-appearance (the owner
on someone else's show) is for stories and voice, never the teaching itself; ideas from a guest are credited to the
guest; never invent a figure, a client, a quote or a result. For cover photos, shortlist with photo_pick and call
photo_use on the photos you deliver. For YouTube thumbnails, call thumb_pick with the hook type, then thumb_use with the
ids you delivered. Never name or guess anyone else in a photo.`;

class UserError extends Error {}
type Tool = { name: string; title: string; description: string; readOnly: boolean; inputSchema: Record<string, unknown>; run: (args: any) => Promise<unknown> };
const str = (description: string) => ({ type: "string", description });
const clamp = (v: unknown, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d));
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : []);
const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const must = <T,>(r: { data: T | null; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data as T; };

// Signed links for files in brain-assets (missing files come back null).
async function sign(paths: (string | null | undefined)[], seconds: number, transform?: { width: number }) {
  const ok = [...new Set(paths.filter((p): p is string => !!p))];
  const out: Record<string, string | null> = {};
  if (!ok.length) return out;
  if (transform) {
    // image transformations sign one at a time; a plan without them falls back to the full file
    await Promise.all(ok.map(async (p) => {
      const r = await assets.createSignedUrl(p, seconds, { transform: { width: transform.width, resize: "contain" } });
      out[p] = r.data?.signedUrl ?? null;
    }));
    const missing = ok.filter((p) => !out[p]);
    if (missing.length) Object.assign(out, await sign(missing, seconds));
    return out;
  }
  const { data, error } = await assets.createSignedUrls(ok, seconds);
  if (error) throw new Error(`signing links failed: ${error.message}`);
  for (const d of data ?? []) if (d.path) out[d.path] = d.error ? null : d.signedUrl ?? null;
  return out;
}

const DOC_FIELDS = "id, title, doc_type, summary, sensitivity, source, tags, updated_at";
const visible = <T extends { eq: any; neq: any }>(q: T) => (CONFIDENTIAL ? q.eq("status", "active") : q.eq("status", "active").neq("sensitivity", "confidential"));
const label = (d: { sensitivity?: string; tags?: string[] }) => [
  d.sensitivity === "confidential" ? "CONFIDENTIAL: for understanding only, never quote it" : "",
  (d.tags ?? []).includes("guest-appearance") ? "GUEST APPEARANCE: the owner on someone else's show; use for stories and voice, never as the teaching" : "",
].filter(Boolean).join(" | ") || undefined;

const PHOTO_FIELDS = "id, name, kind, storage_path, cutout_path, mask_path, preview_path, description, setting, topics, mood, expression, face_side, hook_types, cover_ok, thumb_ok, width, height, taken_at, tags";
type Photo = { id: string; name: string; kind: string; storage_path: string; cutout_path: string | null; mask_path: string | null; preview_path: string | null; description: string | null; setting: string | null; topics: string[]; mood: string | null; expression: string | null; face_side: "L" | "R"; hook_types: string[]; cover_ok: boolean; thumb_ok: boolean; width: number | null; height: number | null; taken_at: string | null; tags: string[] };

// Photos used lately, newest first: the ids in the last `n` posts of that format.
async function recentlyUsed(format: "cover" | "thumbnail", n: number) {
  const rows = must(await sb.from("brain_asset_usage").select("asset_id, post_key, created_at").eq("format", format).order("created_at", { ascending: false }).limit(400)) as { asset_id: string; post_key: string }[];
  const keys: string[] = [];
  const ids = new Set<string>();
  for (const r of rows) {
    if (!keys.includes(r.post_key)) { if (keys.length >= n) break; keys.push(r.post_key); }
    ids.add(r.asset_id);
  }
  return ids;
}

async function photoLinks(rows: Photo[], seconds: number) {
  const full = await sign(rows.flatMap((r) => [r.storage_path, r.cutout_path, r.mask_path, r.preview_path]), seconds);
  const previews = await sign(rows.filter((r) => !r.preview_path).map((r) => r.storage_path), seconds, { width: 640 });
  return rows.map((r) => ({
    name: r.name, description: r.description, setting: r.setting, topics: r.topics, mood: r.mood, expression: r.expression, face_side: r.face_side,
    hook_types: r.hook_types, width: r.width, height: r.height, taken: r.taken_at, tags: r.tags,
    preview_url: (r.preview_path ? full[r.preview_path] : previews[r.storage_path]) ?? null, full_url: full[r.storage_path] ?? null,
    cutout_url: r.cutout_path ? full[r.cutout_path] ?? null : null, mask_url: r.mask_path ? full[r.mask_path] ?? null : null,
  }));
}

const TOOLS: Tool[] = [
  {
    name: "connector_status", title: "Connector status", readOnly: true,
    description: "What this brain holds: document and photo counts, and whether the brand brief is set up. Call it first to test a new setup.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const count = async (t: string, f?: (q: any) => any) => { let q = sb.from(t).select("id", { count: "exact", head: true }); if (f) q = f(q); const r = await q; return r.count ?? 0; };
      const [documents, brief, photos, thumbs] = await Promise.all([
        count("brain_documents", (q) => q.eq("status", "active")), count("brain_documents", (q) => q.eq("status", "active").eq("in_brief", true)),
        count("brain_assets", (q) => q.eq("kind", "photo").eq("sensitive", false)), count("brain_assets", (q) => q.eq("kind", "photo").eq("sensitive", false).eq("thumb_ok", true).neq("hook_types", "{}")),
      ]);
      return { server: SERVER, tools: TOOLS.map((t) => t.name), documents, brief_documents: brief, photos, thumbnail_photos: thumbs, confidential: CONFIDENTIAL ? "served with a label" : "never served", start_here: "get_brand_brief" };
    },
  },
  {
    name: "get_brand_brief", title: "Brand brief", readOnly: true,
    description: "The brand foundation every piece starts from: who the owner is, the audience, offers and next steps, proof, voice, voice guardrails (banned phrases and framings), the avoid-AI-writing audit and the review standard. Load before writing anything.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const rows = must(await visible(sb.from("brain_documents").select(`${DOC_FIELDS}, content`).eq("in_brief", true)).order("brief_order").order("title")) as any[];
      if (!rows.length) return { documents: [], note: "The brand brief is empty. Run the guided setup (setup-studio) to add the Brand Brief, Voice, Voice Guardrails, Avoid AI Writing and Review Standard documents." };
      return { documents: rows.map((d) => ({ title: d.title, doc_type: d.doc_type, summary: d.summary, notice: label(d), content: d.content })) };
    },
  },
  {
    name: "brain_search", title: "Search the brain", readOnly: true,
    description: "Search the owner's brain (frameworks, offers, proof and testimonials, course and podcast transcripts, past posts, the studio's process docs) by words. Returns titles, types, summaries and a snippet. Read one with brain_get_document.",
    inputSchema: { type: "object", properties: { query: str("words to search for"), limit: { type: "integer", minimum: 1, maximum: 20, default: 8 } }, required: ["query"] },
    run: async (a) => {
      const q = String(a.query ?? "").trim();
      if (!q) throw new UserError("Say what to search for.");
      const k = clamp(a.limit, 1, 20, 8);
      let rows = must(await sb.rpc("brain_search", { q, k, with_confidential: CONFIDENTIAL })) as any[];
      if (!rows.length) {
        rows = must(await visible(sb.from("brain_documents").select(`${DOC_FIELDS}, content`).ilike("title", `%${q}%`)).order("title").limit(k)) as any[];
        rows = rows.map((r) => ({ ...r, snippet: String(r.content ?? "").slice(0, 300), content: undefined }));
      }
      return { results: rows.map((r) => ({ title: r.title, doc_type: r.doc_type, summary: r.summary, tags: r.tags, source: r.source, notice: label(r), snippet: String(r.snippet ?? "").replace(/<\/?b>/g, "") })) };
    },
  },
  {
    name: "brain_get_document", title: "Read a brain document", readOnly: true,
    description: "Read one brain document by its exact title (or id). Long documents come in parts: pass offset to continue.",
    inputSchema: { type: "object", properties: { title: str("exact title, or a document id"), offset: { type: "integer", minimum: 0, default: 0 }, max_chars: { type: "integer", minimum: 2000, maximum: 60000, default: 40000 } }, required: ["title"] },
    run: async (a) => {
      const t = String(a.title ?? "").trim();
      const isId = /^[0-9a-f-]{36}$/i.test(t);
      const rows = must(await visible(sb.from("brain_documents").select(`${DOC_FIELDS}, content`)).eq(isId ? "id" : "title", t).limit(1)) as any[];
      if (!rows.length) {
        const near = must(await visible(sb.from("brain_documents").select("title")).ilike("title", `%${t}%`).order("title").limit(10)) as { title: string }[];
        throw new UserError(`No document titled "${t}". Close matches: ${near.map((r) => r.title).join(" | ") || "none"}`);
      }
      const d = rows[0];
      const off = clamp(a.offset, 0, 1e9, 0), max = clamp(a.max_chars, 2000, 60000, 40000);
      const body = String(d.content ?? "");
      return {
        title: d.title, doc_type: d.doc_type, tags: d.tags, source: d.source, notice: label(d), updated_at: d.updated_at,
        total_chars: body.length, offset: off, next_offset: off + max < body.length ? off + max : null, content: body.slice(off, off + max),
      };
    },
  },
  {
    name: "brain_list_documents", title: "List brain documents", readOnly: true,
    description: "List the brain's documents, optionally by a title prefix or a doc type (brand-foundation, voice, offer, audience, framework, case-study, testimonial, transcript, course, post, copy, content-strategy, studio, reference).",
    inputSchema: { type: "object", properties: { title_prefix: str("optional title prefix"), doc_type: str("optional doc type") } },
    run: async (a) => {
      let q = visible(sb.from("brain_documents").select("title, doc_type, summary, sensitivity, tags, in_brief, updated_at"));
      if (a.title_prefix) q = q.ilike("title", `${String(a.title_prefix)}%`);
      if (a.doc_type) q = q.eq("doc_type", String(a.doc_type));
      const rows = must(await q.order("doc_type").order("title").limit(500)) as any[];
      return { documents: rows.map((d) => ({ title: d.title, doc_type: d.doc_type, summary: d.summary, in_brief: d.in_brief, notice: label(d), updated_at: d.updated_at })) };
    },
  },
  {
    name: "recent_content", title: "Recent content", readOnly: true,
    description: "What the studio has made lately (titles, hooks, kind, status, stage, date), newest first. Check it so new pieces don't repeat a recent hook or angle.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 30 } } },
    run: async (a) => {
      const rows = must(await sb.from("studio_pieces").select("title, hook, kind, status, awareness, insight, scheduled_at, updated_at, studio_episodes(title, show)")
        .in("status", ["draft", "ready", "approved", "scheduled", "posted"]).order("updated_at", { ascending: false }).limit(clamp(a.limit, 1, 100, 30))) as any[];
      return { items: rows.map((r) => ({ title: r.title, hook: r.hook, kind: r.kind, status: r.status, awareness: r.awareness, insight: r.insight, goes_out: r.scheduled_at, from: r.studio_episodes?.title ?? null, show: r.studio_episodes?.show ?? null })) };
    },
  },
  {
    name: "photo_search", title: "Find photos of the owner", readOnly: true,
    description: "Search the owner's photo library for something specific (by words in the name or description, setting, topic, expression). Matches come back shuffled, photos used in the last 30 days last. For a cover shortlist use photo_pick. Links last an hour.",
    inputSchema: { type: "object", properties: { text: str("words matched against the name and description"), setting: str("e.g. studio, office, stage, outdoors"), topic: str("a topic tag"), expression: str("smiling, laughing, serious, talking, neutral"), limit: { type: "integer", minimum: 1, maximum: 30, default: 12 } } },
    run: async (a) => {
      let q = sb.from("brain_assets").select(PHOTO_FIELDS).eq("kind", "photo").eq("sensitive", false);
      if (a.setting) q = q.eq("setting", String(a.setting));
      if (a.expression) q = q.eq("expression", String(a.expression));
      if (a.topic) q = q.contains("topics", [String(a.topic)]);
      let rows = must(await q.limit(500)) as Photo[];
      if (a.text) { const w = String(a.text).toLowerCase().split(/\s+/).filter(Boolean); rows = rows.filter((r) => w.every((x) => `${r.name} ${r.description ?? ""} ${(r.tags ?? []).join(" ")}`.toLowerCase().includes(x))); }
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const used = new Set((must(await sb.from("brain_asset_usage").select("asset_id").gte("created_at", since)) as { asset_id: string }[]).map((r) => r.asset_id));
      const pick = [...shuffle(rows.filter((r) => !used.has(r.id))), ...shuffle(rows.filter((r) => used.has(r.id)))].slice(0, clamp(a.limit, 1, 30, 12));
      return { count: pick.length, photos: await photoLinks(pick, 3600), note: "Links expire in an hour; call photo_get for a fresh one. Other people in photos are never named." };
    },
  },
  {
    name: "photo_pick", title: "Shortlist photos for a cover", readOnly: true,
    description: "A fresh, varied shortlist of the owner's photos for a reel or carousel cover (thumbnail: YouTube, though thumb_pick is the one for thumbnails). Shuffled every call, skips anything used in the last 35 covers or 12 thumbnails, and tilts toward photos whose topics, setting, mood or expression match. Look at the previews, pick, then call photo_use on the photos you deliver.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["cover", "thumbnail"], default: "cover" },
        limit: { type: "integer", minimum: 1, maximum: 30, default: 8 },
        topics: { type: "array", items: { type: "string" } }, settings: { type: "array", items: { type: "string" } },
        moods: { type: "array", items: { type: "string" } }, expressions: { type: "array", items: { type: "string" } },
        exclude: { type: "array", items: { type: "string" }, description: "photo names already turned down for this post" },
      },
    },
    run: async (a) => {
      const fmt = a.format === "thumbnail" ? "thumbnail" : "cover";
      const k = clamp(a.limit, 1, 30, 8);
      const all = must(await sb.from("brain_assets").select(PHOTO_FIELDS).eq("kind", "photo").eq("sensitive", false).eq(fmt === "cover" ? "cover_ok" : "thumb_ok", true).limit(1000)) as Photo[];
      const used = await recentlyUsed(fmt, fmt === "cover" ? 35 : 12);
      const ex = new Set(arr(a.exclude));
      const [topics, settings, moods, expressions] = [arr(a.topics), arr(a.settings), arr(a.moods), arr(a.expressions)];
      const score = (r: Photo) => (r.topics ?? []).filter((t) => topics.includes(t)).length * 2 + (settings.includes(r.setting ?? "") ? 2 : 0) + (moods.includes(r.mood ?? "") ? 1 : 0) + (expressions.includes(r.expression ?? "") ? 1 : 0) + Math.random() * 1.5;
      let pool = all.filter((r) => !ex.has(r.name) && !used.has(r.id));
      // a small library rotates back to its least recent photos rather than coming back empty
      if (pool.length < k) pool = [...pool, ...all.filter((r) => !ex.has(r.name) && used.has(r.id))].slice(0, Math.max(k, pool.length));
      const pick = pool.map((r) => ({ r, s: score(r) })).sort((x, y) => y.s - x.s).slice(0, k).map((x) => x.r);
      return { format: fmt, count: pick.length, photos: await photoLinks(pick, 3600), note: pick.length ? "Shuffled each call. Pick by looking at the previews; call photo_use on the photos you deliver." : "No photos in the library yet. Add them with the guided setup (brain_assets, kind photo)." };
    },
  },
  {
    name: "photo_use", title: "Record the photos a post used", readOnly: false,
    description: "Call once per post with the photos you delivered (usually two options), so photo_pick skips them for a while. Call again with status 'published' and the same post_key once the owner picks one. Returns full-resolution links and the person cutout or mask when there is one (24 hours).",
    inputSchema: {
      type: "object",
      properties: {
        photos: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4, description: "photo names from photo_pick or photo_search" },
        format: { type: "string", enum: ["cover", "thumbnail"] }, post: str("the post's hook or thumbnail text"),
        post_key: str("optional: one key for the delivered and published calls; defaults to today's date plus the post text"),
        status: { type: "string", enum: ["delivered", "published"], default: "delivered" },
      },
      required: ["photos", "format", "post"],
    },
    run: async (a) => {
      const names = arr(a.photos).slice(0, 4);
      if (!names.length) throw new UserError("Pass the photo names you used.");
      const fmt = a.format === "thumbnail" ? "thumbnail" : a.format === "cover" ? "cover" : null;
      if (!fmt) throw new UserError("format must be cover or thumbnail.");
      const status = a.status === "published" ? "published" : "delivered";
      const post = String(a.post ?? "").slice(0, 300);
      const slug = post.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "post";
      const key = String(a.post_key ?? "").trim() || `${new Date().toISOString().slice(0, 10)}-${slug}`;
      const rows = must(await sb.from("brain_assets").select(PHOTO_FIELDS).eq("kind", "photo").eq("sensitive", false).in("name", names)) as Photo[];
      const missing = names.filter((n) => !rows.some((r) => r.name === n));
      if (missing.length) throw new UserError(`Unknown photo name(s): ${missing.join(", ")}. Use the names from photo_pick or photo_search.`);
      must(await sb.from("brain_asset_usage").upsert(rows.map((r) => ({ asset_id: r.id, format: fmt, post_key: key, status, post })), { onConflict: "asset_id,format,post_key,status", ignoreDuplicates: true }));
      const links = await photoLinks(rows, 24 * 3600);
      return { recorded: rows.length, format: fmt, status, post_key: key, photos: links.map((l) => ({ name: l.name, full_url: l.full_url, cutout_url: l.cutout_url, mask_url: l.mask_url })), note: status === "delivered" ? "When the owner picks one, call photo_use again with status 'published' and this post_key." : "Marked as published." };
    },
  },
  {
    name: "photo_get", title: "Get one photo", readOnly: true,
    description: "One photo by its name: its details, signed full-size and preview links, and the preview itself so you can look at it.",
    inputSchema: { type: "object", properties: { name: str("the photo's name"), hours: { type: "integer", minimum: 1, maximum: 24, default: 1 } }, required: ["name"] },
    run: async (a) => {
      const rows = must(await sb.from("brain_assets").select(PHOTO_FIELDS).eq("sensitive", false).eq("name", String(a.name ?? "")).limit(1)) as Photo[];
      if (!rows.length) throw new UserError(`No photo named "${a.name}". Use photo_search to find names.`);
      const [p] = await photoLinks(rows, 3600 * clamp(a.hours, 1, 24, 1));
      let image: string | null = null;
      if (p.preview_url) {
        const r = await fetch(p.preview_url).catch(() => null);
        const buf = r?.ok ? new Uint8Array(await r.arrayBuffer()) : null;
        // only a small preview goes inline (a plan without image resizing signs the full file instead)
        if (buf && buf.length < 1_500_000) { let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000)); image = btoa(bin); }
      }
      return { __image: image, ...p };
    },
  },
  {
    name: "thumb_pick", title: "Pick photos for a YouTube thumbnail", readOnly: true,
    description: "Photos of the owner whose expression plays the hook type (skeptic, verdict, warning, number, secret, smirk, how), as thumbnail pairs: each with signed links to the photo and, when the library has them, its cutout and mask (the thumbnail builder cuts the person out otherwise). Rotates: a photo used in the last 3 thumbnails is skipped. Returns options A and B. Empty when no photo plays that hook type: change the hook, never force one. ids: ask for specific pairs again (fresh links).",
    inputSchema: {
      type: "object",
      properties: {
        hook_type: { type: "string", enum: HOOK_TYPES }, limit: { type: "integer", minimum: 1, maximum: 12, default: 6 },
        exclude: { type: "array", items: { type: "string" }, description: "pair ids already turned down for this video" },
        ids: { type: "array", items: { type: "string" }, description: "optional: these pair ids only, ignoring the rotation" },
      },
      required: ["hook_type"],
    },
    run: async (a) => {
      const ht = String(a.hook_type ?? "");
      if (!HOOK_TYPES.includes(ht)) throw new UserError(`hook_type must be one of ${HOOK_TYPES.join(", ")}`);
      const k = clamp(a.limit, 1, 12, 6);
      const ids = arr(a.ids).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
      let rows: Photo[];
      if (ids.length) rows = must(await sb.from("brain_assets").select(PHOTO_FIELDS).eq("kind", "photo").eq("sensitive", false).in("id", ids)) as Photo[];
      else {
        const all = must(await sb.from("brain_assets").select(PHOTO_FIELDS).eq("kind", "photo").eq("sensitive", false).eq("thumb_ok", true).contains("hook_types", [ht]).limit(500)) as Photo[];
        const used = await recentlyUsed("thumbnail", 3);
        const ex = new Set(arr(a.exclude));
        rows = shuffle(all.filter((r) => !used.has(r.id) && !ex.has(r.id))).slice(0, k);
      }
      if (!rows.length) return { hook_type: ht, count: 0, pairs: [], options: null, note: "No photo of the owner plays this hook type right now. Pick a hook with a playable type, or add photos tagged with it." };
      const links = await sign(rows.flatMap((r) => [r.storage_path, r.cutout_path, r.mask_path, r.preview_path]), 4 * 3600);
      const pairs = rows.map((r) => ({
        id: r.id, pair_id: r.id, cutout: r.name, background_id: "brand", background_label: "Brand background", side: r.face_side, hook_types: r.hook_types,
        frame: null, storage_prefix: "",
        urls: { photo: links[r.storage_path] ?? null, preview: r.preview_path ? links[r.preview_path] ?? null : null, person: r.cutout_path ? links[r.cutout_path] ?? null : null, mask: r.mask_path ? links[r.mask_path] ?? null : null, plate: null, alpha: null, pair: null },
      }));
      return { hook_type: ht, count: pairs.length, options: { A: pairs[0].pair_id, B: pairs[1]?.pair_id ?? null }, pairs, note: "Links last four hours. Call thumb_use with the pair ids you deliver." };
    },
  },
  {
    name: "thumb_use", title: "Record the thumbnail photos a video used", readOnly: false,
    description: "Call once per video with the pair ids you delivered (options A and B) and status 'delivered', so thumb_pick rotates past them; call again with status 'published', the same run_key and the one the owner chose.",
    inputSchema: {
      type: "object",
      properties: { pair_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 }, run_key: str("one key per video; reuse it for the published call"), status: { type: "string", enum: ["delivered", "published"], default: "delivered" }, title: str("the thumbnail words or the video title") },
      required: ["pair_ids", "run_key"],
    },
    run: async (a) => {
      const ids = arr(a.pair_ids).slice(0, 2).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
      if (!ids.length) throw new UserError("Pass the pair ids you delivered.");
      const key = String(a.run_key ?? "").trim();
      if (!key) throw new UserError("run_key is required (reuse it when the owner picks one).");
      const status = a.status === "published" ? "published" : "delivered";
      const seen = must(await sb.from("brain_assets").select("id").in("id", ids)) as { id: string }[];
      const missing = ids.filter((i) => !seen.some((r) => r.id === i));
      if (missing.length) throw new UserError(`Unknown pair id(s): ${missing.join(", ")}. Use the ids from thumb_pick.`);
      must(await sb.from("brain_asset_usage").upsert(ids.map((id) => ({ asset_id: id, format: "thumbnail", post_key: key, status, post: String(a.title ?? "").slice(0, 300) })), { onConflict: "asset_id,format,post_key,status", ignoreDuplicates: true }));
      return { recorded: ids.length, status, run_key: key, pair_ids: ids };
    },
  },
  {
    name: "bg_list", title: "Brand backgrounds", readOnly: true,
    description: "The brand's background images for thumbnails and covers (often none: the builders then use the brand colours), with a signed preview link.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const rows = must(await sb.from("brain_assets").select("id, name, description, storage_path, tags").eq("kind", "background").eq("sensitive", false).order("name")) as any[];
      const links = await sign(rows.map((r) => r.storage_path), 3600);
      return { count: rows.length, backgrounds: rows.map((r) => ({ id: r.id, label: r.name, description: r.description, tags: r.tags, preview_url: links[r.storage_path] ?? null })) };
    },
  },
  {
    name: "asset_list", title: "Logos and brand images", readOnly: true,
    description: "The brand's logos, brand images and font files (kind: logo, brand-image, font, other), with signed links for an hour.",
    inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["logo", "brand-image", "font", "other"] } } },
    run: async (a) => {
      let q = sb.from("brain_assets").select("id, name, kind, description, storage_path, tags").eq("sensitive", false).in("kind", ["logo", "brand-image", "font", "other"]);
      if (a.kind) q = q.eq("kind", String(a.kind));
      const rows = must(await q.order("kind").order("name")) as any[];
      const links = await sign(rows.map((r) => r.storage_path), 3600);
      return { count: rows.length, assets: rows.map((r) => ({ name: r.name, kind: r.kind, description: r.description, tags: r.tags, url: links[r.storage_path] ?? null })) };
    },
  },
];

// ------------------------------------------------------------------ MCP over streamable HTTP (stateless JSON)
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id", "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(msg: any): Promise<unknown | null> {
  const { id, method, params } = msg ?? {};
  if (id === undefined || id === null) return null; // a notification
  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return { jsonrpc: "2.0", id, result: { protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS } };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: true, openWorldHint: false } })) } };
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${params?.name}`);
      try {
        const out: any = await tool.run(params?.arguments ?? {});
        const image = out && typeof out === "object" ? out.__image : null;
        if (out && typeof out === "object") delete out.__image;
        const content: unknown[] = [{ type: "text", text: JSON.stringify(out, null, 2) }];
        if (image) content.push({ type: "image", data: image, mimeType: "image/jpeg" });
        return { jsonrpc: "2.0", id, result: { content, structuredContent: out && typeof out === "object" && !Array.isArray(out) ? out : { result: out } } };
      } catch (e) {
        const user = e instanceof UserError;
        const message = user ? e.message : `Something went wrong in ${tool.name}: ${(e as Error).message}`;
        if (!user) console.error(tool.name, e);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: message }], isError: true } };
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// Constant-time comparison against every configured token.
const TOKENS = (Deno.env.get("STUDIO_BRAIN_TOKENS") ?? "").split(",").map((t) => t.trim()).filter((t) => t.length >= 24);
function allowed(token: string) {
  const enc = new TextEncoder();
  const a = enc.encode(token);
  let ok = false;
  for (const t of TOKENS) {
    const b = enc.encode(t);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    if (diff === 0) ok = true;
  }
  return ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("mcp");
  if (req.method === "GET" && i < 0) return json({ name: SERVER.name, status: "ok", connect: "POST to .../studio-brain/mcp with Authorization: Bearer <token>" });
  if (!TOKENS.length) return json(rpcError(null, -32001, "STUDIO_BRAIN_TOKENS isn't set on this function (supabase secrets set STUDIO_BRAIN_TOKENS=<a long random token>)."), 503);
  const token = (i >= 0 && parts[i + 1]) || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !allowed(token)) return json(rpcError(null, -32001, "Unknown or revoked brain token."), 401);
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST" } });
  let body: any;
  try { body = await req.json(); } catch { return json(rpcError(null, -32700, "Parse error"), 400); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await handle(body);
  return out ? json(out) : new Response(null, { status: 202, headers: CORS });
});
