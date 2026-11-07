import { BOOKING_OFFER, OWNER } from "./brand";

// The networks a piece goes out on, and how each one's caption and call to action work.
export const CHANNELS = ["Instagram", "Facebook", "TikTok", "Threads", "LinkedIn", "YouTube Shorts"] as const;
export type Platform = "instagram" | "facebook" | "tiktok" | "threads" | "linkedin" | "youtube";
export const PLATFORMS: Platform[] = ["instagram", "facebook", "tiktok", "threads", "linkedin", "youtube"];
export const PLATFORM: Record<string, Platform> = { Instagram: "instagram", Facebook: "facebook", TikTok: "tiktok", Threads: "threads", LinkedIn: "linkedin", "YouTube Shorts": "youtube", YouTube: "youtube" };
export const LABEL: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", threads: "Threads", linkedin: "LinkedIn", youtube: "YouTube" };
// Caption limits; Threads is the tight one.
export const LIMIT: Record<Platform, number> = { instagram: 2200, facebook: 5000, tiktok: 2200, threads: 500, linkedin: 3000, youtube: 5000 };

// One caption goes out on every network; a network gets its own only when someone writes one. Where
// the shared caption runs over a network's limit, it keeps the hook (first paragraph), as many of the next paragraphs as
// fit, in order, and the next step (last paragraph); a hook that's too long on its own ends on its last full sentence.
export function fitCaption(text: string, max: number) {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  const paras = t.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const [hook, ...rest] = paras;
  const last = rest.length ? rest[rest.length - 1] : "";
  const mid = rest.slice(0, -1);
  const join = (xs: string[]) => xs.filter(Boolean).join("\n\n");
  if (join([hook, last]).length <= max) {
    const kept: string[] = [];
    for (const p of mid) if (join([hook, ...kept, p, last]).length <= max) kept.push(p);
    return join([hook, ...kept, last]);
  }
  const room = last && last.length + 2 < max / 2 ? max - last.length - 2 : max;
  let s = "";
  for (const x of hook.match(/[^.!?]+[.!?]+["')\]”]*\s*/g) ?? []) { if ((s + x).trim().length > room) break; s += x; }
  if (!s.trim()) s = `${hook.slice(0, room - 1).replace(/\s+\S*$/, "")}…`;
  return join([s.trim(), room < max ? last : ""]);
}

// What goes out on one network: its own caption when someone wrote one, otherwise the shared caption, fitted to its limit
// either way (a network's own caption is usually the shared one with its own last paragraph, so it runs just as long:
// every Threads caption was over 500 until 2026-11-07).
export function captionFor(shared: string | null | undefined, own: Partial<Record<string, string>> | null | undefined, net: Platform) {
  const mine = own?.[net]?.trim();
  return fitCaption(mine && mine !== (shared ?? "").trim() ? mine : shared ?? "", LIMIT[net]);
}
// The highest intention of every piece is that people save it. The writers are asked for a plain save line before the
// next step, and they sometimes drop it, so it goes in here when it's missing.
export const SAVE_LINE = "Save this post for later.";
export function ensureSave(text: string) {
  const ps = paras(text);
  if (!ps.length || ps.slice(0, -1).some((x) => /\bsave\b/i.test(x)) || (ps.length === 1 && /\bsave\b/i.test(ps[0]))) return text.trim();
  return ps.length === 1 ? [ps[0], SAVE_LINE].join("\n\n") : [...ps.slice(0, -1), SAVE_LINE, ps[ps.length - 1]].join("\n\n");
}
// Where the bottom-of-funnel offer is booked: bookingUrl() in lib/brand.ts (BOOKING_URL, else brand/studio.json).
export { bookingUrl } from "./brand";
// A caption's paragraphs. The last one is the next step, so a network whose next step works differently ("link in bio"
// means nothing on LinkedIn) gets the shared caption with its own last paragraph.
export const paras = (t: string | null | undefined) => (t ?? "").trim().split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
export const bodyOf = (t: string | null | undefined) => paras(t).slice(0, -1).join("\n\n");
export const withEnding = (t: string, last: string) => [...paras(t).slice(0, -1), last.trim()].join("\n\n");
// A network's own caption, as opposed to the shared one (old drafts stored the shared caption as Instagram's).
export const ownCaptions = (shared: string | null | undefined, own: Partial<Record<string, string>> | null | undefined) =>
  Object.fromEntries(Object.entries(own ?? {}).filter(([, v]) => v?.trim() && v.trim() !== (shared ?? "").trim())) as Partial<Record<Platform, string>>;

// Where each kind can go, and where it goes unless someone changes it: the full episode to YouTube,
// Facebook and LinkedIn (its audio goes out on the podcast from the episode's podcast step); reels everywhere; text
// posts to LinkedIn, Facebook and Threads, plus Instagram once an image is attached.
export const CHANNELS_FOR: Record<string, string[]> = {
  episode: ["YouTube", "Facebook", "LinkedIn"],
  reel: ["TikTok", "YouTube Shorts", "Instagram", "Facebook", "LinkedIn", "Threads"],
  carousel: ["Instagram", "Facebook", "LinkedIn", "Threads", "TikTok"],
  post: ["LinkedIn", "Facebook", "Threads", "Instagram"],
};
export const DEFAULT_CHANNELS: Record<string, string[]> = {
  episode: ["YouTube", "Facebook", "LinkedIn"],
  reel: ["TikTok", "YouTube Shorts", "Instagram", "Facebook", "LinkedIn", "Threads"],
  carousel: ["Instagram", "Facebook", "LinkedIn"],
  post: ["LinkedIn", "Facebook", "Threads"],
};
export const channelsFor = (kind: string): string[] => CHANNELS_FOR[kind] ?? [...CHANNELS];
// The channels a piece shows: its own picks, or its kind's defaults (a post with an image adds Instagram).
export const chosen = (kind: string, channels?: string[] | null, image?: boolean) =>
  channels?.length ? channels : [...(DEFAULT_CHANNELS[kind] ?? CHANNELS), ...(kind === "post" && image ? ["Instagram"] : [])];

// The networks a piece goes to: the ones picked, or its kind's defaults.
export function platformsFor(kind: string, channels?: string[] | null, image?: boolean): Platform[] {
  const base = chosen(kind, channels, image).map((c) => PLATFORM[c]).filter(Boolean);
  return PLATFORMS.filter((p) => base.includes(p));
}

export type LeadMagnet = {
  id: string; name: string; keyword: string; offer: string | null; link: string | null;
  manychat: Partial<Record<Platform, { live?: boolean; trigger?: string; how?: string }>>; crm: string | null; notes: string | null; active: boolean; verified_at: string | null;
};

// How a lead magnet's call to action works on each network: ManyChat sends it when people comment (Instagram, Facebook)
// or DM (TikTok) the keyword, the owner sends it by hand (LinkedIn, Threads), or, where no automation is live, the link.
export type Cta = "comment" | "dm" | "manual" | "link";
export function ctaMode(lm: LeadMagnet, p: Platform): Cta {
  if (p === "instagram" || p === "facebook") return lm.manychat?.[p]?.live ? "comment" : "link";
  if (p === "tiktok") return lm.manychat?.tiktok?.live ? "dm" : "link";
  if (p === "linkedin" || p === "threads") return "manual";
  return "link";
}

export function ctaNote(lm: LeadMagnet | null, p: Platform) {
  if (!lm) return p === "linkedin" ? "Next step in the first comment" : p === "facebook" || p === "youtube" ? "Next step with the link written out" : "Next step: link in bio";
  return {
    comment: `People comment ${lm.keyword}; ManyChat sends it`,
    dm: `People DM ${lm.keyword}; ManyChat replies`,
    manual: `People comment ${lm.keyword}; ${OWNER} sends it by hand`,
    link: p === "youtube" || p === "facebook" ? "Points to the link" : `No ManyChat automation for ${lm.keyword} here yet, so it says link in bio`,
  }[ctaMode(lm, p)];
}

// The call-to-action plan the caption writer follows, one line per network. `link` is the episode's own link when it has
// one; without it the next step is said in words, never a placeholder ("[EPISODE URL]" once got written).
// A standalone idea has no episode to point to, so its next step is the offer from the brand brief.
// With no lead magnet, the next step is the full episode, or the booking offer (BOOKING_OFFER) for a standalone idea (no
// episode to point to) and for a product-aware or most-aware piece (`assess`, the bottom of the funnel: lib/stages.ts).
export function ctaPlan(lm: LeadMagnet | null, platforms: Platform[], link?: string | null, idea = false, opts: { assess?: boolean; booking?: string } = {}) {
  const what = lm ? `the ${lm.name.toLowerCase()}` : "";
  const book = !lm && (idea || !!opts.assess);
  const thing = book ? `book ${BOOKING_OFFER} (say what it gets them)` : "the full episode";
  const url = book ? opts.booking ?? "" : link ?? "";
  const words = (p: Platform) => (p === "facebook" ? ` with "link in the comments"` : " in words");
  return platforms.map((p) => {
    if (!lm) return `${LABEL[p]}: one plain next step: ${thing}${p === "linkedin" ? (url ? ", with the link in the first comment" : ", in words (there's no link on file, so don't mention a comment)") : p === "facebook" || p === "youtube" ? (url ? `, with this link written out: ${url}` : `,${words(p)}; there's no link on file yet`) : ", \"link in bio\""}.`;
    return `${LABEL[p]}: ` + {
      comment: `ask people to comment ${lm.keyword}; ManyChat sends them ${what}.`,
      dm: `ask people to DM ${lm.keyword}; ManyChat replies with ${what}.`,
      manual: `ask people to comment ${lm.keyword} and say ${OWNER} will send ${what} (these are sent by hand).`,
      link: p === "youtube" || p === "facebook" ? (lm.link ? `point to ${what}: ${lm.link}.` : `point to ${what}${words(p)}; there's no link on file yet.`) : `point to ${what} with "link in bio" (ManyChat isn't set up for ${lm.keyword} on ${LABEL[p]}, so don't ask for a comment or DM).`,
    }[ctaMode(lm, p)];
  }).join("\n");
}
