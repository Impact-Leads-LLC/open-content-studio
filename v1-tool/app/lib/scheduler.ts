import type { Platform } from "./platforms";
import { SCHEDULER_ID, SCHEDULER_NAME } from "./brand";
import * as cs from "./contentstudio";
import * as mc from "./metricool";

// The scheduler the studio publishes through, picked by SCHEDULER in the Vercel settings: "contentstudio" (the default)
// or "metricool". Both take one post per network, so each gets its own type, caption, media and cover, and a rejection
// names the network it came from. Everything outside this file talks to the scheduler through these functions only.

export const NAME = SCHEDULER_NAME;
export const ID = SCHEDULER_ID;
const metricool = ID === "metricool";
// any other scheduler: posting kits and the calendar CSV instead of sending (lib/postkit.ts)
export const EXPORT = ID === "export";

export type Media = { video?: string; cover?: string; images?: string[] };
// collaborators: Instagram co-author invites (@handles, up to 3); firstComment: posted under it.
export type Draft = { platform: Platform; text: string; media: Media; title: string; kind: string; collaborators?: string[]; firstComment?: string };
export type Result = { platform: Platform; account?: string; ok: boolean; post_id?: string; url?: string; warning?: string; error?: string; status?: string; detail?: string };
// The place posts go: a ContentStudio workspace or a Metricool brand, with the time zone it schedules in.
export type Conn = { id: string; name: string; timezone: string };
export type Account = { id: string; platform: string; account_name?: string; status?: string };

// Where a first comment can go (the same networks on both).
export const FIRST_COMMENT: Platform[] = metricool ? mc.FIRST_COMMENT : cs.FIRST_COMMENT;

export const configured = () => (EXPORT ? false : metricool ? mc.configured() : cs.configured());
// What's missing, in the words the send panel shows.
export const notConnected = () => (EXPORT
  ? `The studio posts through ${NAME} by hand: use the piece's posting kit, or the calendar's CSV for a bulk upload.`
  : metricool
  ? "Metricool isn't connected yet: METRICOOL_API_TOKEN and METRICOOL_USER_ID go in the Vercel project settings."
  : "ContentStudio isn't connected yet: CONTENTSTUDIO_API_KEY goes in the Vercel project settings.");

export async function connection(): Promise<Conn> {
  if (metricool) { const b = await mc.brand(); return { id: b.id, name: b.name, timezone: b.timezone }; }
  const w = await cs.workspace();
  return { id: w.id, name: w.name ?? w.id, timezone: w.timezone ?? "" };
}

export async function accounts(conn: Conn): Promise<Account[]> {
  return metricool ? (await mc.accounts(conn.id)).map((a) => ({ id: a.id, platform: a.platform, account_name: a.account_name })) : cs.accounts(conn.id);
}

export const accountFor = (list: Account[], p: Platform): Account | undefined =>
  metricool ? list.find((a) => a.platform === p) : cs.accountFor(list, p);

export const postType = (p: Platform, kind: string, m: Media) => (metricool ? mc.postType(p, kind, m) : cs.postType(p, kind, m));
export const why = (p: Platform, kind: string) => (metricool ? mc.why(p, kind) : cs.why(p, kind));

// Metricool only posts media it holds a copy of (signed links expire), so the files are handed over once, before any
// post; ContentStudio fetches the links itself.
export async function prepareMedia(m: Media, conn: Conn): Promise<Media> {
  return metricool && (m.video || m.images?.length) ? mc.holdMedia(m, conn.id) : m;
}

// One post on one network. `at` is the piece's date: a scheduled post goes out then. Metricool wants a date in the future
// even for a draft, so a draft without one gets this time tomorrow.
export async function createPost(conn: Conn, d: Draft, account: Account, mode: "draft" | "scheduled", at?: string | null) {
  if (metricool) {
    const when = at && Date.parse(at) > Date.now() + 5 * 60000 ? at : new Date(Date.now() + 864e5).toISOString();
    return mc.createPost(conn.id, mc.buildPost(d, mode, when, conn.timezone || undefined));
  }
  const time = mode === "scheduled" && at ? cs.wsTime(at, conn.timezone || undefined) : undefined;
  return cs.createPost(conn.id, cs.buildPost(d, account.id, mode, time));
}

export const postStatus = (conn: Conn, id: string) => (metricool ? mc.postStatus(conn.id, id) : cs.postStatus(conn.id, id));
