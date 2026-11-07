import { descriptionHtml, notesHtml, live, type Episode, type Show } from "./podcast";
import { BRAND } from "./brand";

// The RSS feed Apple, Spotify and every podcast app read. Built from the database on each request (the CDN keeps it
// for 5 minutes), so a scheduled episode appears on its own once its time comes. No keys or database calls here, so the
// same function can be checked offline against a real feed.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
const tag = (name: string, value: string | number | null | undefined) => (value === null || value === undefined || value === "" ? "" : `<${name}>${esc(String(value))}</${name}>`);

export type FeedUrls = { feed: string; file: (path: string) => string };

export function feedUrlFor(show: Pick<Show, "slug" | "feed_base">, fallbackBase: string) {
  return `${(show.feed_base || fallbackBase).replace(/\/$/, "")}/feed/${show.slug}.xml`;
}

// OP3 (op3.dev) counts downloads by sitting in front of the audio link and passing the listener straight on.
export const enclosureUrl = (url: string, op3: boolean) => (op3 ? `https://op3.dev/e/${url.replace(/^https?:\/\//, "")}` : url);

export function buildFeed(show: Show, episodes: Episode[], urls: FeedUrls, now = Date.now()) {
  const items = episodes.filter((e) => live(e, now)).sort((a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime());
  const art = show.artwork_path ? urls.file(show.artwork_path) : "";
  const cats = show.categories.map((c) => (c.sub ? `<itunes:category text="${esc(c.category)}"><itunes:category text="${esc(c.sub)}"/></itunes:category>` : `<itunes:category text="${esc(c.category)}"/>`)).join("");
  const head = [
    tag("title", show.title),
    tag("link", show.website),
    `<atom:link href="${esc(urls.feed)}" rel="self" type="application/rss+xml"/>`,
    tag("language", show.language),
    tag("copyright", show.copyright),
    `<description>${cdata(notesHtml(show.description))}</description>`,
    tag("itunes:author", show.author),
    `<itunes:owner>${tag("itunes:name", show.owner_name)}${tag("itunes:email", show.owner_email)}</itunes:owner>`,
    art && `<itunes:image href="${esc(art)}"/>`,
    art && `<image>${tag("url", art)}${tag("title", show.title)}${tag("link", show.website)}</image>`,
    cats,
    tag("itunes:explicit", show.explicit ? "true" : "false"),
    tag("itunes:type", show.show_type),
    show.new_feed_url ? tag("itunes:new-feed-url", show.new_feed_url) : "",
    tag("podcast:guid", show.podcast_guid),
    `<podcast:locked${show.owner_email ? ` owner="${esc(show.owner_email)}"` : ""}>${show.locked ? "yes" : "no"}</podcast:locked>`,
    tag("podcast:medium", "podcast"),
    tag("generator", BRAND),
    tag("lastBuildDate", new Date(now).toUTCString()),
  ];
  const body = items.map((e) => {
    const html = descriptionHtml(e);
    const transcript = e.transcript_path ? urls.file(e.transcript_path) : "";
    const ttype = /\.vtt$/i.test(e.transcript_path ?? "") ? "text/vtt" : /\.srt$/i.test(e.transcript_path ?? "") ? "application/x-subrip" : "text/plain";
    return [
      "<item>",
      tag("title", e.title),
      tag("link", e.blog_url || show.website),
      `<guid isPermaLink="false">${esc(e.guid)}</guid>`,
      tag("pubDate", new Date(e.published_at!).toUTCString()),
      `<description>${cdata(html)}</description>`,
      `<content:encoded>${cdata(html)}</content:encoded>`,
      `<enclosure url="${esc(enclosureUrl(urls.file(e.audio_path!), show.op3))}" length="${e.audio_bytes ?? 0}" type="${esc(e.audio_type ?? "audio/mpeg")}"/>`,
      tag("itunes:duration", e.duration),
      tag("itunes:season", e.season),
      tag("itunes:episode", e.number),
      tag("itunes:episodeType", e.episode_type),
      tag("itunes:explicit", e.explicit ? "true" : "false"),
      e.artwork_path ? `<itunes:image href="${esc(urls.file(e.artwork_path))}"/>` : "",
      transcript ? `<podcast:transcript url="${esc(transcript)}" type="${ttype}"/>` : "",
      e.guest ? `<podcast:person role="guest"${e.guest_url ? ` href="${esc(e.guest_url)}"` : ""}>${esc(e.guest)}</podcast:person>` : "",
      "</item>",
    ].filter(Boolean).join("\n");
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
${head.filter(Boolean).join("\n")}
${body.join("\n")}
</channel>
</rss>
`;
}
