# The brain

Everything the studio writes, judges and edits is built from your brain: your brand brief, your voice, your offers,
your proof, your teaching, your photos. The app never reads the brain's tables itself. Every Claude call, in the app
and on the cloud machines, connects to one **MCP server** and calls its tools while it works. That server is the
contract: anything that answers these tools can be the brain.

You have two ways to run it:

1. **The kit's brain** (most members): the Supabase edge function `supabase/functions/studio-brain`, deployed to your
   studio's own Supabase project, reading the tables `brain_documents`, `brain_assets` and `brain_asset_usage` from
   `supabase/schema.sql`. The guided setup fills them with your material.
2. **Your own second brain**: if you already run one that speaks the same tool names and shapes (below), point the
   studio at it instead. Nothing in the app changes.

Either way the app needs two settings: `BRAIN_MCP_URL` (the server's address) and `BRAIN_MCP_TOKEN` (its bearer token).
The cloud jobs get the same two.

## The connection

- Transport: MCP over streamable HTTP, stateless JSON-RPC (`initialize`, `tools/list`, `tools/call`). Event-stream
  answers are fine too.
- Auth: `Authorization: Bearer <BRAIN_MCP_TOKEN>`. Claude's MCP connector sends it the same way.
- Tool results: a JSON object, as `structuredContent` and as the text of the first content block. A failure is
  `isError: true` with a plain message.

## The tools

| Tool | Arguments | Returns | Who calls it |
|---|---|---|---|
| `get_brand_brief` | none | `{documents: [{title, doc_type, summary, notice?, content}]}`: every document that's part of the brief, in order | every prompt, first |
| `brain_search` | `query`, `limit` (1 to 20, default 8) | `{results: [{title, doc_type, summary, tags, source, notice?, snippet}]}`, best match first | every prompt |
| `brain_get_document` | `title` (exact, or the id), `offset`, `max_chars` | `{title, doc_type, tags, source, notice?, total_chars, offset, next_offset, content}` | every prompt |
| `brain_list_documents` | `title_prefix`, `doc_type` (both optional) | `{documents: [...]}` | the engines, now and then |
| `recent_content` | `limit` | `{items: [{title, hook, kind, status, awareness, insight, goes_out, from, show}]}`, newest first | the Moment Coach, the training-material gatherer |
| `photo_search` | `text`, `setting`, `topic`, `expression`, `limit` | `{photos: [{name, description, ..., preview_url, full_url, cutout_url, mask_url}]}` | the carousel builder |
| `photo_pick` | `format` (cover or thumbnail), `limit`, `topics`, `settings`, `moods`, `expressions`, `exclude` | a rotated shortlist, same photo shape | the carousel builder |
| `photo_use` | `photos` (names), `format`, `post`, `post_key`, `status` (delivered or published) | `{photos: [{name, full_url, cutout_url, mask_url}]}`, links for 24 hours | the carousel builder |
| `photo_get` | `name`, `hours` | one photo's details and links, plus its preview as an image | Claude, to look before picking |
| `thumb_pick` | `hook_type` (skeptic, verdict, warning, number, secret, smirk, how), `limit`, `exclude`, `ids` | `{options: {A, B}, pairs: [{id, pair_id, cutout, background_id, background_label, side, hook_types, frame, storage_prefix, urls: {photo, preview, person, mask, plate, alpha, pair}}]}` | the app (`lib/thumbnail.ts`) |
| `thumb_use` | `pair_ids`, `run_key`, `status`, `title` | `{recorded}` | the app |
| `bg_list` | none | `{backgrounds: [{id, label, preview_url}]}` (empty is normal) | the thumbnail builder |
| `asset_list` | `kind` (logo, brand-image, font, other) | `{assets: [{name, kind, url}]}` | Claude, when it needs a logo |
| `connector_status` | none | counts, to test a setup | you, during setup |

`notice` marks the two kinds of document every prompt treats differently: **confidential** (understand it, never
quote it) and **guest appearance** (you on someone else's show: use it for your stories and voice, never as the
teaching). By default the kit's brain doesn't serve confidential documents at all; set the function secret
`STUDIO_BRAIN_CONFIDENTIAL=label` to serve them with the notice.

A thumbnail "pair" is one of your photos. `side` is where you sit in the frame (`R` by default: the call look puts the
guest's frame on the left). `urls.person` is a transparent cutout of you and `urls.mask` a person mask; when neither is
there the thumbnail builder cuts you out on the machine. A photo plays a hook type when you tag it with that type
(`hook_types`): a smiling photo might play smirk and how, a serious one verdict and warning.

## The documents the prompts name

The prompts load these by exact title. The guided setup creates them from `supabase/brain-starter/` and fills them
with your words. Keep the titles; change what's inside.

| Title | Part of the brief | What it holds |
|---|---|---|
| Brand Brief | yes (1) | Who you are, who the content is for, offers and the next step each piece points to, proof, named ideas |
| Voice | yes (2) | How you sound, phrases you use, examples |
| Voice Guardrails | yes (3) | Banned phrases and framings |
| Avoid AI Writing | yes (4) | The audit every draft goes through |
| Review Standard | yes (5) | The coach's seven checks (`stop`, `owner`, `truth`, `person`, `fresh`, `door`, `lint`) and verdicts |
| Content Strategy | no | Lane, pillars, the five awareness levels for your audience, rhythm |
| Reel Edits | no | How reels are cut and what's on screen |
| Full Episode Edits | no | How the full episode is produced |
| Thumbnails | no | Thumbnail words and looks |
| Carousels | no | Carousel formats and rules |

Everything else you add (course transcripts, podcast transcripts, past posts, testimonials, offer documents, case
studies) is found with `brain_search` and built into posts and carousels.

## The tables (the kit's brain)

`brain_documents`: `title` (unique), `doc_type` (brand-foundation, voice, offer, audience, framework, case-study,
testimonial, transcript, course, post, copy, content-strategy, studio, reference), `summary`, `content`, `sensitivity`
(public, internal, confidential), `source` (where it came from), `tags` (for example `guest-appearance`, `course`,
`podcast`), `in_brief` and `brief_order` (part of `get_brand_brief`), `status` (active or archived), and `fts`, a
full-text index over the title, summary and content that `brain_search` uses (the database function `brain_search`).

`brain_assets`: one row per file in the private bucket `brain-assets`: `name` (unique), `kind` (photo, logo,
brand-image, background, font, other), `storage_path`, optional `cutout_path`, `mask_path` and `preview_path`, and for
photos `description`, `setting`, `topics`, `mood`, `expression`, `face_side`, `hook_types`, `cover_ok`, `thumb_ok`.
`sensitive` keeps a file out of every tool.

`brain_asset_usage`: which photos went out where, so `photo_pick` and `thumb_pick` rotate past recent ones.

`recent_content` reads `studio_pieces`, so the brain always knows what the studio made.

## Adding to it

From `app/` with `app/.env.local` holding the Supabase pair:

```bash
node scripts/brain.mjs starter                    # the ten starter documents (keeps any you already have)
node scripts/brain.mjs doc notes/brief.md --title "Brand Brief" --type brand-foundation --brief 1
node scripts/brain.mjs doc course/module-3.txt --type course --tags course
node scripts/brain.mjs doc guest/acme-podcast.txt --type transcript --tags podcast,guest-appearance
node scripts/brain.mjs doc contracts/terms.md --type reference --sensitivity confidential
node scripts/brain.mjs photo photos/office-smile.jpg --expression smiling --setting office --hooks smirk,how
node scripts/brain.mjs asset brand/logo-dark.svg --kind logo
node scripts/brain.mjs list
```

The same title or name again replaces the entry. Or edit rows directly in Supabase's table editor.

## The kit's brain function

- Code: `supabase/functions/studio-brain/index.ts`.
- Deploy: `supabase functions deploy studio-brain --no-verify-jwt` (the token is the auth, not a Supabase login).
- Secrets: `STUDIO_BRAIN_TOKENS` (one or more long random tokens, comma separated: one for the studio, and one for
  each other place you connect, like your own Claude, so you can revoke them one at a time), optionally
  `STUDIO_BRAIN_NAME` and `STUDIO_BRAIN_CONFIDENTIAL`.
- Address: `https://<project-ref>.supabase.co/functions/v1/studio-brain/mcp`.
- It reads with the project's service key, which Supabase provides to the function; nothing else can reach the tables.

You can connect the same address to Claude (Settings > Connectors > Add custom connector, or `claude mcp add`) to
write with your brain outside the studio.

## Using your own second brain instead

Point `BRAIN_MCP_URL` and `BRAIN_MCP_TOKEN` at it. It needs at least `get_brand_brief`, `brain_search` and
`brain_get_document` with the shapes above, and the ten documents (or documents that say the same things under those
titles). Without `recent_content`, ideas may repeat recent angles. Without the photo tools, carousel covers use episode
stills and generated pictures only. Without `thumb_pick` and `thumb_use`, thumbnails can't be made (the panel says so).
