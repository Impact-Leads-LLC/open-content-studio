import { MODEL } from "./brand";

// The brain connector: an MCP server over HTTP that answers the tools the prompts use (get_brand_brief, brain_search,
// brain_get_document, recent_content, photo_pick, photo_use, thumb_pick, thumb_use...). The kit ships one as the Supabase
// edge function studio-brain (BRAIN.md); a member who already has a second brain that speaks the same tools points
// these two settings at it instead.
const clean = (v?: string) => (v ?? "").trim();

export function brain() {
  const url = clean(process.env.BRAIN_MCP_URL).replace(/\/+$/, "");
  const token = clean(process.env.BRAIN_MCP_TOKEN).replace(/\s+/g, "");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Add ANTHROPIC_API_KEY in the Vercel project settings, then redeploy.");
  if (!/^https:\/\//.test(url)) throw new Error("Add BRAIN_MCP_URL (the brain connector's https address) in the Vercel project settings, then redeploy.");
  if (!token) throw new Error("Add BRAIN_MCP_TOKEN (the brain connector's token) in the Vercel project settings, then redeploy.");
  return { url, token };
}

// What every cloud job gets to reach Claude and the brain (engines/README.md). run.sh never prints them.
export function engineEnv(): Record<string, string> {
  const b = brain();
  return { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "", BRAIN_MCP_URL: b.url, BRAIN_MCP_TOKEN: b.token, CLAUDE_MODEL: MODEL };
}

// One tool call straight to the brain (stateless MCP over HTTP), for the app's own lookups (the thumbnail photos).
export async function brainCall<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const b = brain();
  const r = await fetch(b.url, {
    method: "POST", cache: "no-store",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${b.token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const raw = await r.text();
  // a server that answers in event-stream form puts the JSON on its data: line
  const body = raw.trim().startsWith("{") ? raw : (raw.match(/^data:\s*(\{.*\})\s*$/m)?.[1] ?? "");
  const j = (() => { try { return JSON.parse(body); } catch { return null; } })();
  if (!r.ok || !j || j.error) throw new Error(`The brain connector didn't answer ${name} (${j?.error?.message ?? r.status}).`);
  if (j.result?.isError) throw new Error(String(j.result.content?.[0]?.text ?? `${name} failed`).slice(0, 300));
  return (j.result?.structuredContent ?? JSON.parse(j.result?.content?.[0]?.text ?? "{}")) as T;
}
