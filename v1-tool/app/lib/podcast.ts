// Podcast hosting: the show and its episodes live in studio_podcast_shows / studio_podcast_episodes, the
// audio and artwork in the public `podcast` bucket, and the feed is built on request at /feed/<show>.xml.
// This file is shared by the pages and the server, so it holds no keys and no database calls.

export type Category = { category: string; sub?: string };
export type Platform = { url?: string; note?: string; checked?: string };
export type Show = {
  id: string; slug: string; title: string; author: string; description: string; language: string; explicit: boolean;
  show_type: "episodic" | "serial"; categories: Category[]; artwork_path: string | null; owner_name: string; owner_email: string;
  website: string; copyright: string; podcast_guid: string; locked: boolean; feed_base: string | null; new_feed_url: string | null;
  op3: boolean; platforms: Record<string, Platform>; move: Record<string, string>; updated_at: string;
};
export type Job = { job: string; status: "running" | "ready" | "failed"; at: string; log?: string; source?: string };
export type Episode = {
  id: string; show_id: string; episode_id: string | null; guid: string; slug: string; title: string; summary: string; notes: string;
  status: "draft" | "ready" | "published"; published_at: string | null; season: number | null; number: number | null;
  episode_type: "full" | "trailer" | "bonus"; explicit: boolean; audio_path: string | null; audio_bytes: number | null;
  audio_type: string | null; duration: number | null; audio_job: Job | null; artwork_path: string | null; transcript_path: string | null;
  guest: string | null; guest_url: string | null; youtube_url: string | null; blog_url: string | null; tags: string[];
  source: Record<string, unknown> | null; created_at: string; updated_at: string;
};

export const BUCKET = "podcast";

// Apple Podcasts' category list. Spotify and the rest read the same tags.
export const CATEGORIES: Record<string, string[]> = {
  Arts: ["Books", "Design", "Fashion & Beauty", "Food", "Performing Arts", "Visual Arts"],
  Business: ["Careers", "Entrepreneurship", "Investing", "Management", "Marketing", "Non-Profit"],
  Comedy: ["Comedy Interviews", "Improv", "Stand-Up"],
  Education: ["Courses", "How To", "Language Learning", "Self-Improvement"],
  Fiction: ["Comedy Fiction", "Drama", "Science Fiction"],
  Government: [],
  History: [],
  "Health & Fitness": ["Alternative Health", "Fitness", "Medicine", "Mental Health", "Nutrition", "Sexuality"],
  "Kids & Family": ["Education for Kids", "Parenting", "Pets & Animals", "Stories for Kids"],
  Leisure: ["Animation & Manga", "Automotive", "Aviation", "Crafts", "Games", "Hobbies", "Home & Garden", "Video Games"],
  Music: ["Music Commentary", "Music History", "Music Interviews"],
  News: ["Business News", "Daily News", "Entertainment News", "News Commentary", "Politics", "Sports News", "Tech News"],
  "Religion & Spirituality": ["Buddhism", "Christianity", "Hinduism", "Islam", "Judaism", "Religion", "Spirituality"],
  Science: ["Astronomy", "Chemistry", "Earth Sciences", "Life Sciences", "Mathematics", "Natural Sciences", "Nature", "Physics", "Social Sciences"],
  "Society & Culture": ["Documentary", "Personal Journals", "Philosophy", "Places & Travel", "Relationships"],
  Sports: ["Baseball", "Basketball", "Cricket", "Fantasy Sports", "Football", "Golf", "Hockey", "Rugby", "Running", "Soccer", "Swimming", "Tennis", "Volleyball", "Wilderness", "Wrestling"],
  Technology: [],
  "True Crime": [],
  "TV & Film": ["After Shows", "Film History", "Film Interviews", "Film Reviews", "TV Reviews"],
};

// Where the show is listed. Each one reads the feed on its own schedule once it has the feed's address; nothing is pushed.
export const PLATFORMS: { id: string; name: string; manage: string; how: string }[] = [
  { id: "apple", name: "Apple Podcasts", manage: "https://podcastsconnect.apple.com/", how: "Checks the feed every few hours. Podcasts Connect has a Refresh button." },
  { id: "spotify", name: "Spotify", manage: "https://creators.spotify.com/", how: "Spotify for Creators. Checks the feed every few hours." },
  { id: "youtube", name: "YouTube", manage: "https://studio.youtube.com/", how: "Full episodes go up as videos from the studio. YouTube can also read the feed (Studio, Content, Podcasts)." },
  { id: "amazon", name: "Amazon Music", manage: "https://podcasters.amazon.com/", how: "Amazon Music for Podcasters." },
  { id: "iheart", name: "iHeartRadio", manage: "https://www.iheart.com/content/submit-your-podcast/", how: "Submitted once with the feed's address." },
  { id: "podcastindex", name: "Podcast Index", manage: "https://podcastindex.org/add", how: "Feeds Overcast, Pocket Casts, Fountain and most smaller apps." },
];

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "episode";

export const minutes = (s: number | null | undefined) => {
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = Math.round(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

// In the feed today (published, its time has come, audio in place) or waiting for its time.
export const live = (e: Episode, now = Date.now()) => e.status === "published" && !!e.audio_path && !!e.published_at && new Date(e.published_at).getTime() <= now;
export const scheduled = (e: Episode, now = Date.now()) => e.status === "published" && !!e.published_at && new Date(e.published_at).getTime() > now;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linkify = (s: string) => esc(s).replace(/https?:\/\/[^\s<)]+[^\s<).,;:!?]/g, (u) => `<a href="${u}">${u}</a>`);

// Show notes are written as plain text: paragraphs split by a blank line, list lines start with "- ", links written out.
// Podcast apps get simple HTML (p, ul, li, a), which is all Apple keeps.
export function notesHtml(text: string) {
  const out: string[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const rows = block.split("\n").map((r) => r.trim()).filter(Boolean);
    if (!rows.length) continue;
    let para: string[] = [], list: string[] = [];
    const flush = () => {
      if (para.length) out.push(`<p>${para.map(linkify).join("<br>")}</p>`);
      if (list.length) out.push(`<ul>${list.map((l) => `<li>${linkify(l)}</li>`).join("")}</ul>`);
      para = []; list = [];
    };
    for (const r of rows) {
      const m = r.match(/^[-*•]\s+(.*)$/);
      if (m) { if (para.length) flush(); list.push(m[1]); } else { if (list.length) flush(); para.push(r); }
    }
    flush();
  }
  return out.join("");
}

// What a podcast app shows: the summary first (apps preview the opening lines), then the notes.
export const descriptionHtml = (e: Pick<Episode, "summary" | "notes">) => [e.summary.trim() && notesHtml(e.summary), notesHtml(e.notes)].filter(Boolean).join("");

export type Check = { ok: boolean; label: string; detail?: string; episode?: string };

// Apple's requirements plus the things that quietly break a feed (duplicate ids, empty sizes, wrong audio format).
export function checkFeed(show: Show, eps: Episode[]): Check[] {
  const out: Check[] = [];
  const add = (ok: boolean, label: string, detail?: string, episode?: string) => out.push({ ok, label, detail, episode });
  add(!!show.title.trim(), "Show title");
  add(show.description.trim().length >= 50 && show.description.length <= 4000, "Show description", "Between 50 and 4,000 characters.");
  add(!!show.artwork_path, "Show artwork", "Square JPG or PNG, 1400 to 3000 pixels.");
  add(show.categories.length > 0 && show.categories.every((c) => c.category in CATEGORIES && (!c.sub || CATEGORIES[c.category].includes(c.sub))), "Apple category");
  add(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(show.owner_email), "Owner email", "Spotify and Apple send ownership codes here.");
  add(!!show.podcast_guid, "Show id (podcast:guid)");
  const inFeed = eps.filter((e) => e.status === "published");
  add(inFeed.some((e) => live(e)), "At least one episode in the feed");
  const guids = new Map<string, number>(), nums = new Map<string, number>();
  for (const e of inFeed) {
    guids.set(e.guid, (guids.get(e.guid) ?? 0) + 1);
    if (e.number != null) nums.set(`${e.season ?? 0}-${e.number}`, (nums.get(`${e.season ?? 0}-${e.number}`) ?? 0) + 1);
  }
  add([...guids.values()].every((n) => n === 1), "Every episode id is unique", "Duplicate ids show as duplicate episodes in apps.");
  add([...nums.values()].every((n) => n === 1), "Episode numbers don't repeat");
  for (const e of inFeed) {
    if (!e.audio_path) add(false, "Audio in place", e.audio_job?.status === "running" ? "Still being prepared." : "No audio yet.", e.title);
    else if (!/^audio\/(mpeg|x-m4a|mp4)$/.test(e.audio_type ?? "")) add(false, "MP3 or M4A audio", `This one is ${e.audio_type ?? "unknown"}.`, e.title);
    else if (!e.audio_bytes || !e.duration) add(false, "File size and length recorded", undefined, e.title);
    if (!descriptionHtml(e)) add(false, "Show notes", "Apps show an empty page without them.", e.title);
  }
  return out;
}
