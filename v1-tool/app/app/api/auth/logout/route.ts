import { db } from "../../../../lib/supabase";
import { clearCookie, cookieToken, sha256 } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const token = cookieToken(req);
  if (token) await db().from("studio_sessions").delete().eq("token_hash", sha256(token));
  return Response.json({ ok: true }, { headers: { "set-cookie": clearCookie } });
}
