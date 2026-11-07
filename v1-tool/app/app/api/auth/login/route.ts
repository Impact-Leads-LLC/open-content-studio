import { db, safeError } from "../../../../lib/supabase";
import { checkPassword, startSession } from "../../../../lib/auth";

export const runtime = "nodejs";
const NO = "That email and password don't match.";

export async function POST(req: Request) {
  try {
    const { email = "", password = "" } = await req.json().catch(() => ({}));
    const { data } = await db().from("studio_users").select("id,password_hash,active").eq("email", String(email).trim().toLowerCase()).maybeSingle();
    const ok = await checkPassword(String(password), data?.password_hash);
    if (!ok || !data?.active) {
      await new Promise((r) => setTimeout(r, 400));
      return Response.json({ error: NO }, { status: 401 });
    }
    return Response.json({ ok: true }, { headers: { "set-cookie": await startSession(data.id) } });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
