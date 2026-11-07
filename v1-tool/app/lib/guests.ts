import type { Platform } from "./platforms";

// Tagging the guest. Their public handle on each network lives on the episode, for tagging only: this is never a
// people list or a CRM.
export type Handles = Partial<Record<Platform, string>>;
export type Guest = { name: string | null; handles: Handles };
// An @handle in the text links to the person on these. LinkedIn needs a real tag, which the schedulers' APIs can't make,
// and Facebook can't tag a personal profile from an app.
export const TAG_IN_TEXT: Platform[] = ["instagram", "tiktok", "threads", "youtube"];
export const HANDLE_FIELDS: { net: Platform; label: string; hint: string }[] = [
  { net: "instagram", label: "Instagram", hint: "@handle or profile link" },
  { net: "tiktok", label: "TikTok", hint: "@handle or profile link" },
  { net: "threads", label: "Threads", hint: "@handle or profile link" },
  { net: "youtube", label: "YouTube", hint: "@handle or channel link" },
  { net: "linkedin", label: "LinkedIn", hint: "profile link, for tagging by hand" },
];

// A profile link only counts on the network's own site, and on TikTok, Threads and YouTube only as /@name (a post,
// a reel or a /channel/ link names no one).
const HOSTS: Partial<Record<Platform, RegExp>> = {
  instagram: /^(www\.|m\.)?instagram\.com$/i,
  tiktok: /^(www\.|m\.)?tiktok\.com$/i,
  threads: /^(www\.)?threads\.(net|com)$/i,
  youtube: /^(www\.|m\.)?youtube\.com$/i,
};
const NOT_PROFILES = /^(p|reel|reels|stories|explore|tv|accounts|direct)$/i;

// "@name" from a handle or a profile link; LinkedIn keeps the /in/ profile link. "" when it doesn't look like one.
export function cleanHandle(net: Platform, raw: string) {
  const t = raw.trim();
  if (!t) return "";
  if (net === "linkedin") {
    const m = t.match(/^(https?:\/\/)?([a-z]+\.)?linkedin\.com\/in\/([^/\s?#]{2,100})\/?([?#]\S*)?$/i);
    return m ? `https://www.linkedin.com/in/${m[3]}` : "";
  }
  let h = t;
  if (/^https?:\/\//i.test(t) || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(t)) {
    let u: URL;
    try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); } catch { return ""; }
    if (!HOSTS[net]?.test(u.hostname)) return "";
    const seg = decodeURIComponent(u.pathname.split("/").filter(Boolean)[0] ?? "");
    if ((net !== "instagram" && !seg.startsWith("@")) || NOT_PROFILES.test(seg)) return "";
    h = seg;
  }
  h = h.replace(/^@/, "");
  return /^[A-Za-z0-9._-]{1,60}$/.test(h) ? `@${h}` : "";
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The guest's @handle where the text first names them after the hook (the full name, else the first name), or in the
// hook when that's the only place (never on YouTube, where the first line is the title). Text that already has the
// handle, or never names the guest, stays as it is.
export function tagGuest(text: string, guest: Guest | null | undefined, net: Platform) {
  const handle = guest?.handles?.[net], name = guest?.name?.trim();
  if (!text || !handle || !name || !TAG_IN_TEXT.includes(net) || text.toLowerCase().includes(handle.toLowerCase())) return text;
  const cut = text.indexOf("\n\n");
  const head = cut < 0 ? "" : text.slice(0, cut), rest = cut < 0 ? text : text.slice(cut);
  const names = [...new Set([name, name.split(/\s+/)[0]])];
  const swap = (seg: string) => {
    for (const n of names) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}@])${esc(n)}(?![\\p{L}\\p{N}])`, "u");
      if (re.test(seg)) return seg.replace(re, (_m, pre: string) => `${pre}${handle}`);
    }
    return null;
  };
  const later = swap(rest);
  if (later !== null) return head + later;
  const first = net === "youtube" || !head ? null : swap(head);
  return first !== null ? first + rest : text;
}

// A caption that sends people to the comments for the link ("Link in the first comment", "linked in the comments").
export const pointsToComment = (text: string) => /\blink(ed)?\b[^.\n]*\b(first comment|the comments)\b/i.test(text);
