#!/usr/bin/env node
// Put packed engines where the app looks for them: studio-media/uploads/<unix-ms>-<name>.tgz. The app always uses the
// newest upload whose name contains the engine's name, so uploading a new one is how a new version goes live, and the
// older upload stays there to roll back to (delete the newest and the one before it takes over).
//
//   node engines/upload.mjs                    uploads every packed file in engines/dist/
//   node engines/upload.mjs thumb-engine       uploads one (engines/dist/thumb-engine.tgz), or several names
//   node engines/upload.mjs path/to/file.tgz   uploads that file (its name must contain one of the engine names)
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, from the environment or from ../app/.env.local. Node 20, no
// packages. The key is never printed.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, "dist");
const NAMES = ["stack-engine", "carousel-engine", "episode-engine", "animated-engine", "thumb-engine"];

// the app's settings file, for whatever the environment doesn't already set
const envFile = path.join(HERE, "..", "app", ".env.local");
if (existsSync(envFile)) for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (!m || process.env[m[1]]) continue;
  process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
}

const url = String(process.env.SUPABASE_URL ?? "").replace(/\s+/g, "").replace(/\/+$/, "");
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/\s+/g, "");
if (!url || !key) fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (in app/.env.local or the environment).");
if (!/^https?:\/\//.test(url)) fail("SUPABASE_URL should look like https://<project>.supabase.co");

const args = process.argv.slice(2);
let files;
if (!args.length) {
  files = existsSync(DIST) ? readdirSync(DIST).filter((f) => f.endsWith(".tgz")).map((f) => path.join(DIST, f)) : [];
  if (!files.length) fail("Nothing packed yet. Run: bash engines/pack.sh");
} else {
  files = args.map((a) => (a.endsWith(".tgz") ? path.resolve(a) : path.join(DIST, `${a.replace(/\/$/, "")}.tgz`)));
}
for (const f of files) {
  if (!existsSync(f)) fail(`No file at ${f}. Pack it first: bash engines/pack.sh ${path.basename(f, ".tgz")}`);
  if (!NAMES.some((n) => path.basename(f).includes(n))) fail(`${path.basename(f)}: the name must contain one of ${NAMES.join(", ")} (that's how the app finds it).`);
}

// A new secret key (sb_secret_...) goes in the apikey header only; a legacy service-role JWT goes in both headers.
const headers = { apikey: key, "content-type": "application/gzip", "x-upsert": "false", ...(key.startsWith("sb_") ? {} : { authorization: `Bearer ${key}` }) };
const scrub = (s) => String(s).split(key).join("[key]").replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[key]");
for (const f of files) {
  const name = NAMES.find((n) => path.basename(f).includes(n));
  const dest = `uploads/${Date.now()}-${name}.tgz`;
  let r;
  try {
    r = await fetch(`${url}/storage/v1/object/studio-media/${dest}`, { method: "POST", headers, body: readFileSync(f) });
  } catch (e) {
    fail(`Couldn't reach Supabase (${scrub(e?.message ?? e).slice(0, 200)}).`);
  }
  if (!r.ok) fail(`Supabase said ${r.status} for ${path.basename(f)}: ${scrub(await r.text()).slice(0, 300)}`);
  console.log(`Uploaded ${path.basename(f)} (${(statSync(f).size / 1e6).toFixed(1)} MB) to studio-media/${dest}. The next ${name} job uses it.`);
}

function fail(msg) { console.error(msg); process.exit(1); }
