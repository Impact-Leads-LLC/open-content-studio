import type { db } from "./supabase";

import { CADENCE_DAYS, SLOTS, TIMEZONE } from "./brand";

// The posting rhythm (brand/studio.json "slots"). Reels, carousels and text posts go out on their days, at most one of
// each kind a day, in the day's slots (9:00 AM, 12:00 PM and 5:00 PM by default, in the studio's time zone, which should
// match the scheduler's), so a full day is three pieces of three kinds; the long-form episode keeps its own hour on its
// day (Sunday 9:00 AM by default) and the others move to that day's own slots. A kept piece takes the next open slot;
// anyone can drag it somewhere else on the calendar.
export const CADENCE: Record<string, number[]> = CADENCE_DAYS;
export const SLOT_TZ = TIMEZONE;
export const SLOT_HOURS = SLOTS.hours;
const EPISODE_DAY_HOURS = SLOTS.sundayHours;
// the episode's hour on its day
const EPISODE_HOUR = SLOTS.episodeHour;
// pieces that are on their way out, so they hold a slot on the calendar
export const ACTIVE = ["kept", "making", "draft", "changes", "ready", "approved", "scheduled"];

const parts = (t: number, tz: string) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
  .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
// The instant a wall-clock time happens in a time zone (no library: correct the guess by the zone's offset, twice for DST).
function zoned(y: number, m: number, d: number, h: number, tz: string) {
  const guess = Date.UTC(y, m, d, h);
  const off = (t: number) => { const p = parts(t, tz); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t; };
  const t = guess - off(guess);
  return guess - off(t);
}
// Schedule times read in the studio's time zone wherever the viewer is (a laptop on another zone would otherwise show
// 9:00 as 8:00), the zone the slots and the scheduler use; a date field takes and gives that time too.
const STAMP: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
export const slotStamp = (iso: string, opts: Intl.DateTimeFormatOptions = STAMP) => new Date(iso).toLocaleString("en-US", { ...opts, timeZone: SLOT_TZ });
export const toSlotInput = (iso: string) => { const p = parts(Date.parse(iso), SLOT_TZ); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
export function fromSlotInput(v: string) {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? new Date(zoned(+m[1], +m[2] - 1, +m[3], +m[4], SLOT_TZ) + +m[5] * 60000).toISOString() : null;
}
// The calendar day an instant falls on there, as YYYY-MM-DD, and its hour there.
export const dayOf = (t: number, tz = SLOT_TZ) => { const p = parts(t, tz); return `${p.year}-${p.month}-${p.day}`; };
const hourOf = (t: number, tz = SLOT_TZ) => +parts(t, tz).hour;

// What the calendar already holds: the slots taken (day + hour, any kind) and, per day, the kinds that go out.
export type Taken = { slots: Set<string>; kinds: Map<string, Set<string>> };
export function mark(taken: Taken, kind: string, at: string | number) {
  const t = typeof at === "number" ? at : new Date(at).getTime();
  const day = dayOf(t);
  taken.slots.add(`${day} ${hourOf(t)}`);
  if (!taken.kinds.has(day)) taken.kinds.set(day, new Set());
  taken.kinds.get(day)!.add(kind);
}

// The next open slot for a kind: the first day of its cadence that has no piece of that kind yet, at the first of the
// day's slots no other piece holds (the episode only at its hour). Null for a kind with no cadence.
export function nextSlot(kind: string, taken: Taken, from = Date.now()): string | null {
  const days = CADENCE[kind];
  if (!days) return null;
  const [y, m, d] = dayOf(from).split("-").map(Number);
  for (let i = 0; i < 400; i++) {
    const wd = new Date(Date.UTC(y, m - 1, d + i)).getUTCDay();
    if (!days.includes(wd)) continue;
    for (const h of kind === "episode" ? [EPISODE_HOUR] : wd === SLOTS.episodeDay ? EPISODE_DAY_HOURS : SLOT_HOURS) {
      const t = zoned(y, m - 1, d + i, h, SLOT_TZ);
      const day = dayOf(t);
      if (taken.kinds.get(day)?.has(kind)) break;
      if (t < from + 15 * 60000 || (kind !== "episode" && taken.slots.has(`${day} ${h}`))) continue;
      return new Date(t).toISOString();
    }
  }
  return null;
}

// The slots the calendar's pieces already hold, from yesterday on (every kind: one slot holds one piece).
export async function takenSlots(sb: ReturnType<typeof db>, except?: string): Promise<Taken> {
  let q = sb.from("studio_pieces").select("id, kind, scheduled_at").in("status", ACTIVE).not("scheduled_at", "is", null).gte("scheduled_at", new Date(Date.now() - 864e5).toISOString());
  if (except) q = q.neq("id", except);
  const { data } = await q;
  const taken: Taken = { slots: new Set(), kinds: new Map() };
  for (const r of data ?? []) mark(taken, r.kind as string, r.scheduled_at as string);
  return taken;
}

export const slotFor = async (sb: ReturnType<typeof db>, kind: string, except?: string) => (CADENCE[kind] ? nextSlot(kind, await takenSlots(sb, except)) : null);
