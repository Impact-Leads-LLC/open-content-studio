#!/usr/bin/env node
// Put material into the brain (BRAIN.md): documents into brain_documents, photos, logos and brand images into the
// private bucket brain-assets plus brain_assets. Run again with the same title or name to replace an entry.
//
//   node scripts/brain.mjs starter                       the studio's starter documents (supabase/brain-starter/*.md)
//   node scripts/brain.mjs doc FILE --title "Brand Brief" --type brand-foundation [--brief 1] [--sensitivity internal]
//                              [--tags course,guest-appearance] [--source "..."] [--summary "..."]
//   node scripts/brain.mjs photo FILE --name alex-office-smile [--expression smiling] [--setting office]
//                              [--topics teaching,podcasting] [--mood warm] [--side R] [--hooks smirk,how]
//                              [--cutout FILE.png] [--mask FILE.png] [--description "..."] [--no-cover] [--no-thumb]
//   node scripts/brain.mjs asset FILE --name logo-dark --kind logo|brand-image|background|font|other [--description "..."]
//   node scripts/brain.mjs list                          what the brain holds
//
// FILE for a document: .md or .txt (a .docx or PDF goes in as text: convert it first). The first "# " line becomes the
// title when --title is left out. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (environment or .env.local).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const url = (process.env.SUPABASE_URL ?? "").replace(/\s+/g, "").replace(/\/$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/\s+/g, "");
const auth = { apikey: key, ...(key.startsWith("sb_") ? {} : { authorization: `Bearer ${key}` }) };

const [cmd, file, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith("--")) continue;
  const k = rest[i].slice(2);
  if (rest[i + 1] === undefined || rest[i + 1].startsWith("--")) opt[k] = true; else opt[k] = rest[++i];
}
const list = (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml", ttf: "font/ttf", otf: "font/otf", woff2: "font/woff2", pdf: "application/pdf" };

if (!url || !key) fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (in app/.env.local or the environment).");

async function upsert(table, conflict, row) {
  const r = await fetch(`${url}/rest/v1/${table}?on_conflict=${conflict}`, { method: "POST", headers: { ...auth, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) });
  if (!r.ok) fail(`Supabase said ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json())[0];
}
async function upload(local, dest) {
  const ext = path.extname(local).slice(1).toLowerCase();
  const r = await fetch(`${url}/storage/v1/object/brain-assets/${dest}`, { method: "POST", headers: { ...auth, "content-type": MIME[ext] ?? "application/octet-stream", "x-upsert": "true" }, body: readFileSync(local) });
  if (!r.ok) fail(`Storage said ${r.status} for ${path.basename(local)}: ${(await r.text()).slice(0, 300)}`);
  return dest;
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

async function doc(f, o) {
  if (!f || !existsSync(f)) fail("Give the document's file.");
  let content = readFileSync(f, "utf8").replace(/\r/g, "").trim();
  const head = content.match(/^#\s+(.+)\n/);
  const title = o.title || head?.[1]?.trim() || path.basename(f).replace(/\.[^.]+$/, "");
  const row = {
    title, doc_type: o.type || "reference", content, summary: typeof o.summary === "string" ? o.summary : null,
    sensitivity: o.sensitivity || "internal", source: typeof o.source === "string" ? o.source : path.basename(f), tags: list(o.tags),
    in_brief: o.brief !== undefined, brief_order: Number(o.brief) || 100, status: "active", updated_at: new Date().toISOString(),
  };
  const d = await upsert("brain_documents", "title", row);
  console.log(`saved "${d.title}" (${d.doc_type}, ${d.sensitivity}${d.in_brief ? `, in the brief at ${d.brief_order}` : ""}, ${content.length.toLocaleString()} characters)`);
}

async function photo(f, o) {
  if (!f || !existsSync(f)) fail("Give the photo's file.");
  const name = slug(o.name || path.basename(f).replace(/\.[^.]+$/, ""));
  const dir = `photos/${name}`;
  const row = {
    name, kind: "photo", storage_path: await upload(f, `${dir}/photo${path.extname(f).toLowerCase()}`),
    cutout_path: typeof o.cutout === "string" ? await upload(o.cutout, `${dir}/cutout.png`) : null,
    mask_path: typeof o.mask === "string" ? await upload(o.mask, `${dir}/mask.png`) : null,
    description: typeof o.description === "string" ? o.description : null, setting: typeof o.setting === "string" ? o.setting : null,
    topics: list(o.topics), mood: typeof o.mood === "string" ? o.mood : null, expression: typeof o.expression === "string" ? o.expression : null,
    face_side: o.side === "L" ? "L" : "R", hook_types: list(o.hooks), cover_ok: !o["no-cover"], thumb_ok: !o["no-thumb"], tags: list(o.tags),
  };
  await upsert("brain_assets", "name", row);
  console.log(`saved photo ${name}${row.hook_types.length ? ` (thumbnail hooks: ${row.hook_types.join(", ")})` : ""}${row.cutout_path ? ", with its cutout" : ""}`);
}

async function asset(f, o) {
  if (!f || !existsSync(f)) fail("Give the file.");
  const kind = ["logo", "brand-image", "background", "font", "other"].includes(o.kind) ? o.kind : "other";
  const name = slug(o.name || path.basename(f).replace(/\.[^.]+$/, ""));
  await upsert("brain_assets", "name", { name, kind, storage_path: await upload(f, `${kind}s/${name}${path.extname(f).toLowerCase()}`), description: typeof o.description === "string" ? o.description : null, tags: list(o.tags), cover_ok: false, thumb_ok: false });
  console.log(`saved ${kind} ${name}`);
}

// The starter documents: title from the first line, type and brief order from STARTER below. Existing ones are kept
// unless --replace is given, so a member's edits are never overwritten.
const STARTER = {
  "brand-brief.md": ["brand-foundation", 1], "voice.md": ["voice", 2], "voice-guardrails.md": ["voice", 3], "avoid-ai-writing.md": ["voice", 4],
  "review-standard.md": ["studio", 5], "content-strategy.md": ["content-strategy", null], "reel-edits.md": ["studio", null],
  "full-episode-edits.md": ["studio", null], "thumbnails.md": ["studio", null], "carousels.md": ["studio", null],
};
async function starter(o) {
  const dir = path.join(root, "..", "supabase", "brain-starter");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
    const [type, brief] = STARTER[f] ?? ["studio", null];
    const title = readFileSync(path.join(dir, f), "utf8").match(/^#\s+(.+)\n/)?.[1]?.trim();
    if (!title) continue;
    const have = await fetch(`${url}/rest/v1/brain_documents?select=id&title=eq.${encodeURIComponent(title)}`, { headers: auth }).then((r) => r.json());
    if (have.length && !o.replace) { console.log(`kept "${title}" (already in the brain)`); continue; }
    await doc(path.join(dir, f), { title, type, ...(brief ? { brief: String(brief) } : {}), source: `brain-starter/${f}` });
  }
}

async function show() {
  const docs = await fetch(`${url}/rest/v1/brain_documents?select=title,doc_type,sensitivity,in_brief,brief_order&status=eq.active&order=in_brief.desc,brief_order,title`, { headers: auth }).then((r) => r.json());
  const assets = await fetch(`${url}/rest/v1/brain_assets?select=name,kind,hook_types&order=kind,name`, { headers: auth }).then((r) => r.json());
  if (!Array.isArray(docs)) fail(`Supabase said: ${JSON.stringify(docs).slice(0, 200)}`);
  console.log(`${docs.length} documents:`);
  for (const d of docs) console.log(`  ${d.in_brief ? `[brief ${d.brief_order}] ` : ""}${d.title} (${d.doc_type}${d.sensitivity === "internal" ? "" : `, ${d.sensitivity}`})`);
  console.log(`${assets.length} assets:`);
  for (const a of assets) console.log(`  ${a.kind}: ${a.name}${a.hook_types?.length ? ` (${a.hook_types.join(", ")})` : ""}`);
}

if (cmd === "doc") await doc(file, opt);
else if (cmd === "photo") await photo(file, opt);
else if (cmd === "asset") await asset(file, opt);
else if (cmd === "starter") await starter({ ...opt, ...(file === "--replace" ? { replace: true } : {}) });
else if (cmd === "list") await show();
else fail("Say starter, doc, photo, asset or list (see the top of this file).");

function fail(msg) { console.error(msg); process.exit(1); }
