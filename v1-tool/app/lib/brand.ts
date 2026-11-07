import cfg from "../brand/studio.json";

// Who the studio is for, from brand/studio.json (the guided setup fills it in). Safe to import anywhere, pages included:
// nothing here is secret. Voice, offers, proof and the review standard live in the brain (BRAIN.md), not here.

type Palette = { primary: string; accent: string; ink: string; paper: string; soft: string };
type Cfg = {
  owner?: string; ownerFull?: string; brand?: string; tagline?: string; handle?: string; website?: string; audience?: string;
  idealClient?: string; offerIdea?: string; ideas?: string[]; bookingOffer?: string; bookingUrl?: string; shows?: string[];
  primaryNetwork?: string; timezone?: string; timezoneLabel?: string; model?: string;
  slots?: { hours?: number[]; sundayHours?: number[]; episodeDay?: number; episodeHour?: number; days?: Partial<Record<"reel" | "carousel" | "post", number[]>> };
  palette?: Partial<Palette>; fonts?: { head?: string; body?: string };
  // the tool the team posts with when it isn't ContentStudio or Metricool (Flick, Buffer, Later...), for the app's words
  schedulerName?: string;
};
const c = cfg as Cfg;
const s = (v: unknown, d = "") => (typeof v === "string" && v.trim() ? v.trim() : d);
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : d);

export const OWNER = s(c.owner, "Owner");                    // first name, all over the app: "Waiting for Alex"
export const OWNER_FULL = s(c.ownerFull, OWNER);             // full name, in the prompts and the podcast feed
export const COACH = `Coach ${OWNER}`;                       // the review layer
export const BRAND = s(c.brand, `${OWNER_FULL} Studio`);     // the app's name in the top bar and the tab
export const TAGLINE = s(c.tagline);                         // the line under the name in the LinkedIn preview
export const HANDLE = s(c.handle) ? `@${s(c.handle).replace(/^@+/, "")}` : "";   // the social handle on previews and slides
export const HANDLE_BARE = HANDLE.replace(/^@/, "");
export const WEBSITE = s(c.website);
export const AUDIENCE = s(c.audience, "the people the owner serves");
export const IDEAL_CLIENT = s(c.idealClient, AUDIENCE);
// The idea at the heart of the main offer, for the unaware reader ("doesn't know <this> yet").
export const OFFER_IDEA = s(c.offerIdea, "the owner's approach can solve their problem");
// The owner's own named ideas and frameworks (the brain has the detail); they count as the owner's IP when scored.
export const IDEAS: string[] = (Array.isArray(c.ideas) ? c.ideas : []).map(String).map((x) => x.trim()).filter(Boolean);
// The bottom-of-funnel next step, in words ("a free 20-minute call") and where it's booked (BOOKING_URL overrides).
export const BOOKING_OFFER = s(c.bookingOffer, "a free call");
export const bookingUrl = () => (process.env.BOOKING_URL ?? "").trim() || s(c.bookingUrl) || WEBSITE;
// The shows new episodes can belong to; the first is the default.
export const SHOWS: string[] = (Array.isArray(c.shows) ? c.shows : []).map(String).map((x) => x.trim()).filter(Boolean);
export const SHOW = SHOWS[0] ?? `${OWNER_FULL}'s show`;
export type Network = "instagram" | "facebook" | "tiktok" | "threads" | "linkedin" | "youtube";
const NETS: Network[] = ["instagram", "facebook", "tiktok", "threads", "linkedin", "youtube"];
export const PRIMARY: Network = NETS.includes(s(c.primaryNetwork) as Network) ? (s(c.primaryNetwork) as Network) : "linkedin";
export const TIMEZONE = s(c.timezone, "UTC");
// "New York time" from America/New_York, unless the config names it.
export const TZ_LABEL = s(c.timezoneLabel) || `${(TIMEZONE.split("/").pop() ?? TIMEZONE).replace(/_/g, " ")} time`;
const hours = (v: unknown, d: number[]) => (Array.isArray(v) && v.length && v.every((h) => Number.isInteger(h) && h >= 0 && h < 24) ? (v as number[]) : d);
const days = (v: unknown) => (Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 0 && d < 7) ? (v as number[]) : [0, 1, 2, 3, 4, 5, 6]);
// The posting rhythm: the day's slots, Sunday's slots (the long-form episode has its own hour that day), and the days
// each kind goes out (0 = Sunday).
export const SLOTS = {
  hours: hours(c.slots?.hours, [9, 12, 17]),
  sundayHours: hours(c.slots?.sundayHours, [12, 15, 18]),
  episodeDay: Number.isInteger(c.slots?.episodeDay) ? Number(c.slots!.episodeDay) % 7 : 0,
  episodeHour: Number.isInteger(c.slots?.episodeHour) ? Number(c.slots!.episodeHour) % 24 : 9,
};
export const CADENCE_DAYS: Record<string, number[]> = {
  reel: days(c.slots?.days?.reel), carousel: days(c.slots?.days?.carousel), post: days(c.slots?.days?.post), episode: [SLOTS.episodeDay],
};
// Harbor blue and yellow unless the owner's brand says otherwise. Yellow is an accent only: the key word, the owner's turn.
export const PALETTE: Palette = {
  primary: hex(c.palette?.primary, "#1E4E6E"), accent: hex(c.palette?.accent, "#FFC530"), ink: hex(c.palette?.ink, "#0F1F2B"),
  paper: hex(c.palette?.paper, "#FFFFFF"), soft: hex(c.palette?.soft, "#EEF3F6"),
};
export const FONTS = { head: s(c.fonts?.head, "Libre Franklin"), body: s(c.fonts?.body, "Poppins") };
export const MODEL = (process.env.CLAUDE_MODEL ?? "").trim() || s(c.model, "claude-opus-5-5");
// The scheduler (SCHEDULER in the Vercel settings; next.config.mjs passes it to the pages too). ContentStudio and Metricool
// post straight from the app. Any other tool (Flick, Buffer, Later, Hootsuite...) is "export", the default: every piece
// has a posting kit (its files and each network's caption, ready to upload) and the calendar downloads as a CSV.
const SCHED = (process.env.NEXT_PUBLIC_SCHEDULER ?? process.env.SCHEDULER ?? "").toLowerCase();
export const SCHEDULER_ID: "contentstudio" | "metricool" | "export" = /metricool/.test(SCHED) ? "metricool" : /contentstudio/.test(SCHED) ? "contentstudio" : "export";
export const SCHEDULER_NAME = SCHEDULER_ID === "metricool" ? "Metricool" : SCHEDULER_ID === "contentstudio" ? "ContentStudio" : s(c.schedulerName, "your scheduler");

// The brain documents every prompt names. The guided setup creates them (supabase/brain-starter); BRAIN.md has the list.
export const DOC = {
  brief: "Brand Brief", voice: "Voice", guardrails: "Voice Guardrails", avoidAi: "Avoid AI Writing", review: "Review Standard",
  strategy: "Content Strategy", reels: "Reel Edits", episode: "Full Episode Edits", thumbs: "Thumbnails", carousels: "Carousels",
} as const;

// How every prompt reaches the brain (lib/skill.ts connects it as the MCP server "brain").
export const BRAIN_TOOLS = `Use the brain connector for brand context (get_brand_brief, brain_search, brain_get_document, recent_content).`;
// The brain's rules, the same in every prompt.
export const BRAIN_RULES = `A document marked confidential is for understanding only and never quoted; a document from ${OWNER}'s guest spot
on someone else's show is for ${OWNER}'s stories and voice, never the teaching itself; every number keeps its owner and its condition.`;
// The owner's ideas as a list for the prompts ("" when none are named yet).
export const ideasLine = () => (IDEAS.length ? `${IDEAS.join(", ")}, or another idea of ${OWNER}'s in the brain` : `an idea of ${OWNER}'s as the brain names it`);

// What the cloud engines get in context.json as `studio` (engines/README.md).
export function studioContext() {
  return {
    owner: OWNER, ownerFull: OWNER_FULL, coach: COACH, brand: BRAND, handle: HANDLE, show: SHOW, audience: AUDIENCE,
    website: WEBSITE, bookingUrl: bookingUrl(), timezone: TIMEZONE, palette: PALETTE, fonts: FONTS,
  };
}
