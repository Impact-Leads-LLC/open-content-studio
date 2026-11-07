import { db, safeError } from "../../../../lib/supabase";
import { hashPassword, sha256, startSession } from "../../../../lib/auth";
import { OWNER } from "../../../../lib/brand";

export const runtime = "nodejs";
const GONE = `This invite link has expired or was already used. Ask ${OWNER} for a new one.`;

// An invite link carries a one-time token (7 days). Opening it shows who it's for; sending a password uses it up.
async function invited(token: unknown) {
  if (typeof token !== "string" || !token) return null;
  const { data } = await db().from("studio_users").select("id,name,email,invite_expires,active").eq("invite_hash", sha256(token)).maybeSingle();
  if (!data?.active || !data.invite_expires || new Date(data.invite_expires) < new Date()) return null;
  return data;
}

export async function GET(req: Request) {
  try {
    const u = await invited(new URL(req.url).searchParams.get("token"));
    return u ? Response.json({ name: u.name, email: u.email }) : Response.json({ error: GONE }, { status: 404 });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { token, password = "" } = await req.json().catch(() => ({}));
    const pw = String(password);
    if (pw.length < 10) return Response.json({ error: "Use at least 10 characters." }, { status: 400 });
    const u = await invited(token);
    if (!u) return Response.json({ error: GONE }, { status: 404 });
    const { error } = await db().from("studio_users").update({ password_hash: await hashPassword(pw), invite_hash: null, invite_expires: null }).eq("id", u.id);
    if (error) throw error;
    return Response.json({ ok: true }, { headers: { "set-cookie": await startSession(u.id) } });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
