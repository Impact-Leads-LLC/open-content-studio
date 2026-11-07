import { db, safeError } from "../../../lib/supabase";
import { actor } from "../../../lib/auth";

export const runtime = "nodejs";

// The lead magnets a post can point to: the keyword, what people get, and the follow-through on each network.
export async function GET() {
  try {
    const { data, error } = await db().from("studio_lead_magnets").select("*").order("active", { ascending: false }).order("name");
    if (error) throw error;
    return Response.json({ leadMagnets: data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}

const FIELDS = ["name", "keyword", "offer", "link", "manychat", "crm", "notes", "active"] as const;

// Add one, or update one by id. Anyone signed in can keep the list current.
export async function POST(req: Request) {
  try {
    if (!actor(req)) return Response.json({ error: "Sign in first." }, { status: 401 });
    const body = await req.json();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of FIELDS) if (k in body) row[k] = body[k];
    if (typeof row.keyword === "string") row.keyword = row.keyword.trim().toUpperCase();
    if ("name" in row && !String(row.name ?? "").trim()) return Response.json({ error: "Give it a name." }, { status: 400 });
    if ("keyword" in row && !/^[A-Z0-9]{2,30}$/.test(String(row.keyword))) return Response.json({ error: "The keyword is one word, letters and numbers only." }, { status: 400 });
    const sb = db();
    const q = body.id ? sb.from("studio_lead_magnets").update(row).eq("id", body.id) : sb.from("studio_lead_magnets").insert(row);
    const { data, error } = await q.select().single();
    if (error) throw error;
    return Response.json({ leadMagnet: data });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
