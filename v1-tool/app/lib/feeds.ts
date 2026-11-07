import { storage } from "./supabase";
import { OWNER, OWNER_FULL } from "./brand";

// Riverside's separate tracks: each person's camera and microphone, on the recording's own clock (the transcript's).
// Files look like "riverside_sam_rivera_raw-video-cfr_<show>_3353.mp4" (the person is the part before "_raw") or
// "sam-rivera--sr-_1_06-26-2026_111355.mp4" (person_take_date_time; a nickname in brackets comes out as "--sr-").
export type Feed = { path: string; name: string; size: number; person: string; kind: "video" | "audio"; host: boolean };
export type Person = { person: string; host: boolean; video?: Feed; audio?: Feed };

const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i, AUDIO = /\.(wav|m4a|mp3|aac|flac|ogg)$/i;

export function feedOf(path: string, size: number): Feed | null {
  const name = (path.split("/").pop() ?? "").replace(/^\d+-/, "");
  const kind = VIDEO.test(name) ? "video" : AUDIO.test(name) ? "audio" : null;
  if (!kind) return null;
  const m = name.match(/^riverside[_-](.+?)[_-](?:raw|uncompressed|original|cfr|track|video|audio)/i);
  const t = m ? null : name.match(/^(.+?)_\d+_\d{2}-\d{2}-\d{4}_\d{6}/);
  const raw = (m ? m[1] : t ? t[1].replace(/--[a-z0-9]+-?$/i, "") : name.replace(/\.[^.]+$/, "")).replace(/[_-]+/g, " ").trim();
  const person = raw.split(" ").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return { path, name, size, person, kind, host: isHost(person) };
}

// The host is the owner: a track named with the owner's first or full name (brand/studio.json).
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
export function isHost(person: string) {
  const w = words(person), first = words(OWNER)[0], full = words(OWNER_FULL);
  return (!!first && w.includes(first)) || (full.length > 1 && full.every((x) => w.includes(x)));
}

// One entry per person, guests first (the guest sits on top of the stack, the host underneath). Newest upload wins.
export function people(feeds: Feed[]): Person[] {
  const by = new Map<string, Person>();
  for (const f of feeds) {
    const p = by.get(f.person) ?? { person: f.person, host: f.host };
    if (!p[f.kind] || f.path > p[f.kind]!.path) p[f.kind] = f;
    by.set(f.person, p);
  }
  return [...by.values()].sort((a, b) => Number(a.host) - Number(b.host) || a.person.localeCompare(b.person));
}

// The two people in the stack: a guest on top and the host underneath (or whoever has a camera).
export function stackPair(list: Person[]) {
  const cams = list.filter((p) => p.video);
  const top = cams.find((p) => !p.host) ?? cams[0];
  const bottom = cams.find((p) => p !== top && p.host) ?? cams.find((p) => p !== top);
  return { top, bottom };
}

export async function episodeFeeds(id: string) {
  const { data } = await storage().list(`episodes/${id}/feeds`, { limit: 100 });
  return (data ?? []).filter((f) => f.id).map((f) => feedOf(`episodes/${id}/feeds/${f.name}`, (f.metadata as { size?: number } | null)?.size ?? 0)).filter(Boolean) as Feed[];
}

// Storage paths for the stack: the top camera and its voice, the bottom camera and its voice.
export function pairInput(feeds: Feed[]) {
  const { top, bottom } = stackPair(people(feeds));
  return {
    top: top?.video ? { video: top.video.path, audio: top.audio?.path } : undefined,
    bottom: bottom?.video ? { video: bottom.video.path, audio: bottom.audio?.path } : undefined,
  };
}
