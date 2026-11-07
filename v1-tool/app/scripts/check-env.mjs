#!/usr/bin/env node
// Which settings are filled in, without ever printing a value: app/.env.local (and the environment) checked against
// the list in .env.example. Safe to run anywhere; it shows names and "set" or "missing" only.
//   node scripts/check-env.mjs
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
const file = path.join(root, ".env.local");
const seen = {};
if (existsSync(file)) for (const line of readFileSync(file, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m) seen[m[1]] = (seen[m[1]] ?? 0) + 1;
  if (m && m[2] && !env[m[1]]) env[m[1]] = m[2];
}
// two lines for one name: the scripts read the first one, so a leftover template line wins over the real value
const twice = Object.keys(seen).filter((k) => seen[k] > 1);
// a value still carrying the template's placeholder counts as not filled in
const has = (k) => { const v = String(env[k] ?? "").trim(); return !!v && !/YOUR-PROJECT-REF|<[^>]*>/.test(v); };
const scheduler = /metricool/i.test(env.SCHEDULER ?? "") ? "metricool" : /contentstudio/i.test(env.SCHEDULER ?? "") ? "contentstudio" : "export";
const checks = [
  ["SUPABASE_URL", true, (v) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(v) || "should look like https://<ref>.supabase.co"],
  ["SUPABASE_SERVICE_ROLE_KEY", true, (v) => !(v.startsWith("sb_publishable_") || (/^eyJ/.test(v) && /"role"\s*:\s*"anon"/.test(Buffer.from(v.split(".")[1] ?? "", "base64url").toString()))) || "is the public key: use the secret key"],
  ["ANTHROPIC_API_KEY", true, (v) => v.startsWith("sk-ant-") || "should start with sk-ant-"],
  ["BRAIN_MCP_URL", true, (v) => /^https:\/\//.test(v) || "should be an https address"],
  ["BRAIN_MCP_TOKEN", true, (v) => v.length >= 24 || "should be at least 24 characters"],
  ["SCHEDULER", false, (v) => /^(contentstudio|metricool|export)$/i.test(v) || "should be contentstudio, metricool or export"],
  ["CRON_SECRET", true, (v) => v.length >= 16 || "should be at least 16 characters"],
  // export (any other scheduler) needs no keys: posting kits and the calendar CSV
  ...(scheduler === "metricool"
    ? [["METRICOOL_API_TOKEN", true], ["METRICOOL_USER_ID", true], ["METRICOOL_BLOG_ID", false]]
    : scheduler === "contentstudio" ? [["CONTENTSTUDIO_API_KEY", true], ["CONTENTSTUDIO_WORKSPACE_ID", false], ["CONTENTSTUDIO_SKIP_WORKSPACES", false]] : []),
  ["RETENTION_DAYS", false], ["BOOKING_URL", false], ["GOOGLE_DRIVE_KEY", false, (v) => { try { const k = JSON.parse(v); return (!!k.client_email && !!k.private_key) || "is missing client_email or private_key"; } catch { return "isn't the whole JSON key"; } }],
  ["DRIVE_FOLDER_ID", false], ["FAL_KEY", false], ["CLAUDE_MODEL", false], ["PODCAST_BASE_URL", false],
];
let bad = 0;
console.log(`From ${existsSync(file) ? "app/.env.local and the environment" : "the environment (no app/.env.local yet)"}; scheduler: ${scheduler}\n`);
for (const [k, required, test] of checks) {
  if (!has(k)) { console.log(`${required ? "MISSING " : "  -     "} ${k}${required ? "" : " (optional)"}`); if (required) bad++; continue; }
  const r = test ? test(String(env[k]).trim()) : true;
  console.log(`${r === true ? "  set   " : "CHECK   "} ${k}${r === true ? "" : `: ${r}`}`);
  if (r !== true) bad++;
}
for (const k of twice) { console.log(`CHECK    ${k}: it's in app/.env.local more than once; keep one line (bash scripts/secrets.sh set ${k} ...)`); bad++; }
console.log(bad ? `\n${bad} to fix.` : "\nAll required settings are filled in.");
// keys pasted straight into Vercel's settings (the setup allows it) aren't in app/.env.local, so they show as missing here
if (bad) console.log("A key you put straight into Vercel shows as MISSING here. From app/: npx --yes vercel@65.12.1 env ls lists what Vercel has.");
process.exit(bad ? 1 : 0);
