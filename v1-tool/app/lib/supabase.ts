import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Private working bucket. Posted pieces' files leave after RETENTION_DAYS (lib/retention.ts, RETENTION.md), copied to
// Google Drive first when Drive is set up; unposted work is never touched.
export const BUCKET = "studio-media";

// The publishable key, or a legacy JWT whose role is anon, can't write to a private bucket.
function isPublicKey(key: string) {
  if (key.startsWith("sb_publishable_")) return true;
  try {
    const role = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString()).role;
    return role === "anon";
  } catch {
    return false;
  }
}

// Pasted values can carry spaces or line breaks; keys never contain whitespace.
const clean = (v?: string) => v?.replace(/\s+/g, "") || undefined;

// Error text goes back to the browser, so strip anything that looks like a key or token first.
export function safeError(e: unknown) {
  // Supabase returns database errors as plain objects ({ message, details, hint, code }), not Error instances.
  const o = (e ?? {}) as { message?: unknown; details?: unknown; hint?: unknown };
  let m = e instanceof Error ? e.message : typeof o.message === "string" ? [o.message, o.details, o.hint].filter(Boolean).join(" · ") : String(e);
  for (const v of [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.ANTHROPIC_API_KEY, process.env.BRAIN_MCP_TOKEN, process.env.CONTENTSTUDIO_API_KEY, process.env.METRICOOL_API_TOKEN, process.env.CRON_SECRET, process.env.FAL_KEY]) {
    for (const part of (v ?? "").split(/\s+/)) if (part.length >= 6) m = m.split(part).join("[redacted]");
  }
  m = m
    .replace(/sb_secret_[^\s"']*/g, "[redacted]")
    .replace(/sk-ant-[^\s"']*/g, "[redacted]")
    .replace(/sbt_[\w-]{6,}/g, "[redacted]")
    .replace(/eyJ[\w-]{8,}\.[\w-]+\.[\w-]+/g, "[redacted]");
  console.error("studio error:", m);
  return m;
}

let cached: SupabaseClient | null = null;

export function db() {
  if (cached) return cached;
  const url = clean(process.env.SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw new Error("Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel project settings, then redeploy.");
  if (isPublicKey(key)) throw new Error("SUPABASE_SERVICE_ROLE_KEY holds Supabase's public key. Use the secret key (sb_secret_... or the legacy service_role key), then redeploy.");
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export const storage = () => db().storage.from(BUCKET);

// Private links (1 hour) for files the page needs to show.
export async function sign(paths: string[], secs = 3600): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await storage().createSignedUrls(unique, secs);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

export const fileKind = (name: string) =>
  /\.(mp4|mov|m4v|webm|mkv)$/i.test(name) ? "clip" : /\.(wav|mp3|m4a|aac|flac|ogg)$/i.test(name) ? "audio" : /\.(png|jpe?g|webp)$/i.test(name) ? "image" : /\.(txt|srt|vtt)$/i.test(name) ? "transcript" : /\.tgz$/i.test(name) ? "engine" : "other";
