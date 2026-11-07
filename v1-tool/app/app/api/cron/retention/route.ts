import { safeError } from "../../../../lib/supabase";
import { runRetention } from "../../../../lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// copying a full episode to Google Drive before clearing it can take minutes
export const maxDuration = 800;

// The daily cleanup (RETENTION.md), run by Vercel Cron (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>";
// the middleware lets this path through only with that header, and the route checks it again. ?dry=1 reports what it
// would clear without clearing anything.
export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Not allowed." }, { status: 401 });
  try {
    const dry = new URL(req.url).searchParams.get("dry") === "1";
    const report = await runRetention({ dry });
    return Response.json(report);
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
