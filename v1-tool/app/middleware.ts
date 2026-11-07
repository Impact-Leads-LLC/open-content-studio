import { NextResponse, type NextRequest } from "next/server";

// Every page and API call needs a signed-in team member. The sign-in and invite pages (and their API routes) are the
// only open doors. The person goes to the routes in x-studio-user; a copy sent by the browser is always dropped.
const OPEN = new Set(["/login", "/join", "/api/auth/login", "/api/auth/join", "/api/auth/logout"]);
// Public by design: the podcast feed (Apple, Spotify and every app read it) and the episode list a website can build from.
const PUBLIC = ["/feed/", "/api/site/"];
// The daily cleanup (Vercel Cron): only with Vercel's CRON_SECRET bearer, never with a session.
const CRON = "/api/cron/";
const clean = (v?: string) => v?.replace(/\s+/g, "") ?? "";

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function lookup(token: string) {
  const url = clean(process.env.SUPABASE_URL), key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key || !/^[\w-]{20,100}$/.test(token)) return null;
  // New secret keys (sb_secret_...) go in apikey only; the legacy service_role JWT goes in both headers.
  const headers: Record<string, string> = key.startsWith("sb_") ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };
  const q = `${url}/rest/v1/studio_sessions?select=expires_at,studio_users(id,name,role,email,active)&token_hash=eq.${await sha256(token)}&limit=1`;
  const r = await fetch(q, { headers, cache: "no-store" }).catch(() => null);
  if (!r?.ok) return null;
  const [row] = (await r.json()) as { expires_at: string; studio_users: { id: string; name: string; role: string; email: string; active: boolean } | null }[];
  const u = row?.studio_users;
  if (!u?.active || new Date(row.expires_at) < new Date()) return null;
  return { id: u.id, name: u.name, role: u.role, email: u.email };
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const headers = new Headers(req.headers);
  headers.delete("x-studio-user");
  if (path.startsWith(CRON)) {
    const secret = clean(process.env.CRON_SECRET);
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
    return NextResponse.next({ request: { headers } });
  }
  if (OPEN.has(path) || PUBLIC.some((p) => path.startsWith(p))) return NextResponse.next({ request: { headers } });
  const token = req.cookies.get("studio_session")?.value;
  const user = token ? await lookup(token) : null;
  if (!user) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  headers.set("x-studio-user", encodeURIComponent(JSON.stringify(user)));
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
