// How every finished file is named: the day it goes out, the source show, the guest, what it's about,
// and which piece it is. A Drive folder then sorts by posting date, and anyone can tell what a file is without opening it.
//   2026-11-05_your-show_sam-rivera_linkedin-ask-that-gets-a-reply_reel-04.mp4
// Fields are split by underscores, words inside a field by hyphens. Extra files of the same piece add a suffix:
// _cover.jpg, _slide-01.png, _caption.txt.
const ARTICLES = new Set(["the", "a", "an"]);
const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
export const slug = (s: string, max = 8) => words(s).slice(0, max).join("-");
const pad = (n: number) => String(n).padStart(2, "0");
import { TIMEZONE } from "./brand";

const KIND: Record<string, string> = { reel: "reel", carousel: "carousel", post: "post", episode: "full-episode" };

// The day in the studio's time zone (brand/studio.json), the zone posts go out in.
export const postDay = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : "undated";

// What it's about: the title without notes in brackets, the guest's name or a leading article, six words at most.
function topic(title: string, guest: string | null) {
  let w = words(title.replace(/\([^)]*\)/g, " "));
  const g = guest ? words(guest) : [];
  if (g.length && g.every((x, i) => w[i] === x)) w = w.slice(g.length);
  while (w.length > 1 && ARTICLES.has(w[0])) w = w.slice(1);
  return w.slice(0, 6).join("-") || "untitled";
}

export function clipName(p: { kind: string; num: number; title: string; scheduled_at: string | null }, ep: { show: string; guest: string | null }) {
  const show = slug(ep.show.replace(/^\s*the\s+/i, ""), 4) || "studio";
  const guest = ep.guest ? slug(ep.guest, 3) : "solo";
  return [postDay(p.scheduled_at), show, guest, topic(p.title, ep.guest), `${KIND[p.kind] ?? p.kind}-${pad(p.num)}`].join("_");
}
