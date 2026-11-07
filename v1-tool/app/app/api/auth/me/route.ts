import { actor } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const me = actor(req);
  return me ? Response.json({ me }) : Response.json({ error: "Sign in first." }, { status: 401 });
}
