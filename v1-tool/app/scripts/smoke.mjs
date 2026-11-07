#!/usr/bin/env node
// The setup's smoke test. Reads app/.env.local; never prints a key, a token or a link with a signature.
//   node scripts/smoke.mjs                       the brain connector: its tools, its counts, the brief's documents
//   node scripts/smoke.mjs https://your-studio   also the deployed app: the sign-in page, the cron's lock, a dry run
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, ".env.local");
if (existsSync(file)) for (const line of readFileSync(file, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const say = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) process.exitCode = 1; };

const url = (process.env.BRAIN_MCP_URL ?? "").trim(), token = (process.env.BRAIN_MCP_TOKEN ?? "").trim();
async function rpc(method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const raw = await r.text();
  const body = raw.trim().startsWith("{") ? raw : raw.match(/^data:\s*(\{.*\})\s*$/m)?.[1] ?? "{}";
  return { status: r.status, j: JSON.parse(body) };
}
const call = async (name, args = {}) => { const { j } = await rpc("tools/call", { name, arguments: args }); if (j.error || j.result?.isError) throw new Error(j.error?.message ?? j.result?.content?.[0]?.text); return j.result.structuredContent ?? JSON.parse(j.result.content[0].text); };

if (!url || !token) say(false, "BRAIN_MCP_URL and BRAIN_MCP_TOKEN aren't in app/.env.local");
else {
  try {
    const init = await rpc("initialize", { protocolVersion: "2025-06-18" });
    say(init.status === 200 && !!init.j.result, `brain answers (${init.j.result?.serverInfo?.name ?? init.j.error?.message ?? init.status})`);
    const tools = (await rpc("tools/list", {})).j.result?.tools?.map((t) => t.name) ?? [];
    const need = ["get_brand_brief", "brain_search", "brain_get_document", "recent_content", "photo_pick", "photo_use", "thumb_pick", "thumb_use"];
    say(need.every((n) => tools.includes(n)), `tools: ${need.filter((n) => !tools.includes(n)).length ? `missing ${need.filter((n) => !tools.includes(n)).join(", ")}` : `all ${need.length} the studio uses`}`);
    if (tools.includes("connector_status")) { const s = await call("connector_status"); console.log(`     ${s.documents} documents (${s.brief_documents} in the brief), ${s.photos} photos (${s.thumbnail_photos} tagged for thumbnails)`); }
    const brief = await call("get_brand_brief");
    const titles = (brief.documents ?? []).map((d) => d.title);
    const want = ["Brand Brief", "Voice", "Voice Guardrails", "Avoid AI Writing", "Review Standard"];
    say(want.every((t) => titles.includes(t)), `the brief: ${titles.join(", ") || "empty"}`);
    const docs = (await call("brain_list_documents")).documents?.map((d) => d.title) ?? [];
    const proc = ["Content Strategy", "Reel Edits", "Full Episode Edits", "Thumbnails", "Carousels"];
    say(proc.every((t) => docs.includes(t)), `process documents: ${proc.filter((t) => !docs.includes(t)).length ? `missing ${proc.filter((t) => !docs.includes(t)).join(", ")}` : "all five"}`);
    const s = await call("brain_search", { query: "offer client", limit: 3 });
    say(true, `search works (${(s.results ?? []).length} results for "offer client")`);
  } catch (e) { say(false, `brain: ${String(e.message ?? e).slice(0, 200)}`); }
}

const site = (process.argv[2] ?? "").replace(/\/+$/, "");
if (site) {
  const login = await fetch(`${site}/login`).catch(() => null);
  say(login?.status === 200, `the app's sign-in page (${login?.status ?? "no answer"})`);
  const open = await fetch(`${site}/api/cron/retention`).catch(() => null);
  say(open?.status === 401, `the cleanup refuses calls without the secret (${open?.status ?? "no answer"})`);
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (secret) {
    const r = await fetch(`${site}/api/cron/retention?dry=1`, { headers: { authorization: `Bearer ${secret}` } }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    say(r?.status === 200, `the cleanup's dry run (${r?.status ?? "no answer"}): ${j.error ?? `${j.pieces?.length ?? 0} pieces and ${j.episodes?.length ?? 0} episodes due, keeps ${j.days ?? "?"} days`}`);
  } else say(false, "CRON_SECRET isn't in app/.env.local, so the dry run was skipped");
}
