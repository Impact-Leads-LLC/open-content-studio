import { safeError } from "../../../lib/supabase";
import { EXPORT, NAME, accounts, configured, connection } from "../../../lib/scheduler";

export const runtime = "nodejs";

// Is the scheduler (SCHEDULER: ContentStudio or Metricool) connected, and which account does each network post to?
export async function GET() {
  try {
    if (EXPORT) return Response.json({ configured: false, export: true, name: NAME });
    if (!configured()) return Response.json({ configured: false, name: NAME });
    const conn = await connection();
    const list = await accounts(conn);
    return Response.json({ configured: true, name: NAME, workspace: { id: conn.id, name: conn.name, timezone: conn.timezone }, accounts: list.map((a) => ({ platform: a.platform, name: a.account_name ?? "", status: a.status ?? "" })) });
  } catch (e) {
    return Response.json({ configured: true, name: NAME, error: safeError(e) }, { status: 502 });
  }
}
