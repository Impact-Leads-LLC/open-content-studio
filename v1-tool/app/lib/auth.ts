import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./supabase";

// Team sign-in. Accounts live in studio_users (the owner approves; the team makes), sessions in studio_sessions, and the
// browser only ever holds a random session token in an HttpOnly cookie. middleware.ts checks it on every request.
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const COOKIE = "studio_session";
const SESSION_DAYS = 30;
// Compared against when the email has no account, so a wrong email takes as long as a wrong password.
const DUMMY = `scrypt$${"A".repeat(22)}$${"A".repeat(86)}`;

export type Actor = { id: string; name: string; role: "owner" | "team"; email: string };

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const h = await scrypt(pw.normalize("NFKC"), salt, 64);
  return `scrypt$${salt.toString("base64url")}$${h.toString("base64url")}`;
}

export async function checkPassword(pw: string, stored: string | null | undefined) {
  const [kind, s, h] = (stored || DUMMY).split("$");
  if (kind !== "scrypt" || !s || !h) return false;
  const want = Buffer.from(h, "base64url");
  const got = await scrypt(pw.normalize("NFKC"), Buffer.from(s, "base64url"), want.length);
  return !!stored && got.length === want.length && timingSafeEqual(got, want);
}

// The person signed in for this request. The middleware sets the header after checking the session and drops any
// copy the browser sent, so routes can trust it.
export function actor(req: Request): Actor | null {
  const raw = req.headers.get("x-studio-user");
  if (!raw) return null;
  try { return JSON.parse(decodeURIComponent(raw)) as Actor; } catch { return null; }
}

export async function startSession(userId: string) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  const sb = db();
  const { error } = await sb.from("studio_sessions").insert({ token_hash: sha256(token), user_id: userId, expires_at: expires.toISOString() });
  if (error) throw error;
  await sb.from("studio_users").update({ last_login: new Date().toISOString() }).eq("id", userId);
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires.toUTCString()}`;
}

export const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function cookieToken(req: Request) {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m?.[1] ?? null;
}
