#!/usr/bin/env node
// Make (or re-invite) a person and print their one-time sign-in link. The first one is the owner.
//
//   node scripts/invite.mjs owner you@example.com https://your-studio.vercel.app
//   node scripts/invite.mjs team "Jamie" jamie@example.com https://your-studio.vercel.app
//
// The owner approves, schedules, answers the coach and picks thumbnails; the team makes. The owner's account takes the
// first name in brand/studio.json ("owner"). Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (or in
// .env.local next to package.json). It never prints the key.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const studio = JSON.parse(readFileSync(path.join(root, "brand", "studio.json"), "utf8"));

const args = process.argv.slice(2);
const role = args[0];
if (!["owner", "team"].includes(role)) fail("First say owner or team.");
const [name, email, site] = role === "owner" ? [studio.owner, args[1], args[2]] : [args[1], args[2], args[3]];
if (!name || !email || !/@/.test(email) || !/^https?:\/\//.test(site ?? "")) fail("Usage: node scripts/invite.mjs owner EMAIL SITE_URL   or   node scripts/invite.mjs team NAME EMAIL SITE_URL");

const url = (process.env.SUPABASE_URL ?? "").replace(/\s+/g, "").replace(/\/$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/\s+/g, "");
if (!url || !key) fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (in .env.local or the environment).");

const token = randomBytes(32).toString("base64url");
const row = {
  email: email.toLowerCase().trim(), name, role, active: true,
  invite_hash: createHash("sha256").update(token).digest("hex"),
  invite_expires: new Date(Date.now() + 7 * 864e5).toISOString(),
};
const headers = { apikey: key, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal", ...(key.startsWith("sb_") ? {} : { authorization: `Bearer ${key}` }) };
const r = await fetch(`${url}/rest/v1/studio_users?on_conflict=email`, { method: "POST", headers, body: JSON.stringify(row) });
if (!r.ok) fail(`Supabase said ${r.status}: ${(await r.text()).slice(0, 300)}`);
console.log(`\n${name} (${role}) can set a password here within 7 days:\n\n  ${site.replace(/\/$/, "")}/join?token=${token}\n\nThe link works once. Run this again for a fresh one.\n`);

function fail(msg) { console.error(msg); process.exit(1); }
