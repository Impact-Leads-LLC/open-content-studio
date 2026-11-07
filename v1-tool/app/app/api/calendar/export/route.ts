import { db, safeError } from "../../../../lib/supabase";
import { postingKit } from "../../../../lib/postkit";
import { SLOT_TZ } from "../../../../lib/cadence";
import type { Piece } from "../../../../lib/pieces";

export const runtime = "nodejs";
export const maxDuration = 300;

// The calendar as a CSV for a bulk upload into any scheduler: one row per piece per network, with its date and time in
// the studio's time zone, the caption, the first comment and links to its files (good for a week). Most schedulers take
// a CSV; match these columns to theirs. ?days=14 (default) from today; approved and scheduled pieces only.
const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const local = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: SLOT_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};

export async function GET(req: Request) {
  try {
    const days = Math.max(1, Math.min(60, Number(new URL(req.url).searchParams.get("days")) || 14));
    const from = new Date(), to = new Date(Date.now() + days * 864e5);
    const { data, error } = await db().from("studio_pieces").select("*").in("status", ["approved", "scheduled"]).not("scheduled_at", "is", null)
      .gte("scheduled_at", from.toISOString()).lt("scheduled_at", to.toISOString()).order("scheduled_at");
    if (error) throw error;
    const head = ["date", "time", "timezone", "network", "type", "title", "caption", "first_comment", ...Array.from({ length: 10 }, (_, i) => `media_${i + 1}`)];
    const rows: string[] = [head.join(",")];
    for (const p of (data ?? []) as Piece[]) {
      const kit = await postingKit(p);
      const { date, time } = local(p.scheduled_at!);
      const media = kit.files.filter((f) => f.kind !== "cover").map((f) => f.url).slice(0, 10);
      for (const post of kit.posts) {
        if (!post.text.trim()) continue;
        rows.push([date, time, SLOT_TZ, post.label, p.kind, p.title, post.text, post.firstComment ?? "", ...Array.from({ length: 10 }, (_, i) => media[i] ?? "")].map(cell).join(","));
      }
    }
    return new Response(rows.join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="calendar-${from.toISOString().slice(0, 10)}.csv"` } });
  } catch (e) {
    return Response.json({ error: safeError(e) }, { status: 500 });
  }
}
