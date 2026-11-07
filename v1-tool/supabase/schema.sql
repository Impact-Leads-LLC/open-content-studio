-- The content studio's database: the studio tables, the brain tables, two storage buckets and three functions.
-- Paste the whole file into the Supabase SQL editor (or run `supabase db query --linked -f supabase/schema.sql`).
-- It is safe to run again: every statement creates what's missing and leaves data alone.
--
-- Every table has row level security on and no policies, so only the server (the secret key, in the app and the
-- studio-brain edge function) can read or write. Nothing is reachable with the publishable key.

-- gen_random_uuid() is built into Postgres 13 and later (every Supabase project).

-- ------------------------------------------------------------------ studio: people and sessions
create table if not exists public.studio_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  role text not null,
  password_hash text,
  invite_hash text,
  invite_expires timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login timestamptz
);
alter table public.studio_users add column if not exists password_hash text;
alter table public.studio_users add column if not exists invite_hash text;
alter table public.studio_users add column if not exists invite_expires timestamptz;
alter table public.studio_users add column if not exists active boolean not null default true;
alter table public.studio_users add column if not exists created_at timestamptz not null default now();
alter table public.studio_users add column if not exists last_login timestamptz;
alter table public.studio_users drop constraint if exists studio_users_role_check;
alter table public.studio_users add constraint studio_users_role_check check (role = any (array['owner'::text, 'team'::text]));
alter table public.studio_users drop constraint if exists studio_users_email_check;
alter table public.studio_users add constraint studio_users_email_check check (email = lower(email));
create unique index if not exists studio_users_email_key on public.studio_users (email);
create unique index if not exists studio_users_invite_hash_key on public.studio_users (invite_hash);

create table if not exists public.studio_sessions (
  token_hash text primary key,
  user_id uuid not null references public.studio_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists studio_sessions_user_idx on public.studio_sessions (user_id);

-- ------------------------------------------------------------------ studio: episodes, lead magnets, pieces, notes, rules
create table if not exists public.studio_episodes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  guest text,
  show text not null default 'Main show',
  created_at timestamptz not null default now()
);
alter table public.studio_episodes add column if not exists stack jsonb;
alter table public.studio_episodes add column if not exists transcribe jsonb;
alter table public.studio_episodes add column if not exists archived_at timestamptz;
alter table public.studio_episodes add column if not exists guest_handles jsonb not null default '{}'::jsonb;
alter table public.studio_episodes add column if not exists link text;
alter table public.studio_episodes add column if not exists full_edit jsonb;
alter table public.studio_episodes add column if not exists kind text;
-- the last "Find the moments" run and its report (lib/concepts.ts)
alter table public.studio_episodes add column if not exists moments jsonb;

create table if not exists public.studio_lead_magnets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  keyword text not null,
  offer text,
  link text,
  manychat jsonb not null default '{}'::jsonb,
  crm text,
  notes text,
  active boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists studio_lead_magnets_keyword on public.studio_lead_magnets (lower(keyword));

create table if not exists public.studio_pieces (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.studio_episodes(id) on delete cascade,
  num integer not null,
  kind text not null,
  title text not null,
  hook text,
  source_time text,
  why text,
  status text not null default 'concept',
  body text,
  media jsonb not null default '{}'::jsonb,
  channels text[] not null default '{}'::text[],
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.studio_pieces add column if not exists review jsonb;
alter table public.studio_pieces add column if not exists source_end text;
alter table public.studio_pieces add column if not exists caption text;
alter table public.studio_pieces add column if not exists editor_notes text;
alter table public.studio_pieces add column if not exists outline text;
alter table public.studio_pieces add column if not exists captions jsonb;
alter table public.studio_pieces add column if not exists lead_magnet_id uuid references public.studio_lead_magnets(id) on delete set null;
alter table public.studio_pieces add column if not exists moment jsonb;
alter table public.studio_pieces add column if not exists copy_since timestamptz;
alter table public.studio_pieces add column if not exists copy_failed smallint not null default 0;
alter table public.studio_pieces add column if not exists awareness text;
alter table public.studio_pieces add column if not exists funnel text;
alter table public.studio_pieces add column if not exists insight text;
alter table public.studio_pieces drop constraint if exists studio_pieces_kind_check;
alter table public.studio_pieces add constraint studio_pieces_kind_check check (kind = any (array['episode'::text, 'reel'::text, 'carousel'::text, 'post'::text]));
alter table public.studio_pieces drop constraint if exists studio_pieces_status_check;
alter table public.studio_pieces add constraint studio_pieces_status_check check (status = any (array['concept'::text, 'kept'::text, 'skipped'::text, 'making'::text, 'draft'::text, 'ready'::text, 'changes'::text, 'approved'::text, 'scheduled'::text, 'posted'::text]));
alter table public.studio_pieces drop constraint if exists studio_pieces_awareness_check;
alter table public.studio_pieces add constraint studio_pieces_awareness_check check (awareness = any (array['unaware'::text, 'problem'::text, 'solution'::text, 'product'::text, 'most'::text]));
alter table public.studio_pieces drop constraint if exists studio_pieces_funnel_check;
alter table public.studio_pieces add constraint studio_pieces_funnel_check check (funnel = any (array['top'::text, 'middle'::text, 'bottom'::text]));
create unique index if not exists studio_pieces_episode_id_num_key on public.studio_pieces (episode_id, num);
create index if not exists studio_pieces_scheduled_idx on public.studio_pieces (scheduled_at) where (scheduled_at is not null);

create table if not exists public.studio_notes (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.studio_pieces(id) on delete cascade,
  author text not null default 'Team',
  kind text not null default 'note',
  body text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.studio_notes drop constraint if exists studio_notes_kind_check;
alter table public.studio_notes add constraint studio_notes_kind_check check (kind = any (array['note'::text, 'sendback'::text, 'approve'::text, 'answer'::text, 'coach'::text, 'fix'::text, 'drop'::text]));
create index if not exists studio_notes_piece_idx on public.studio_notes (piece_id, created_at);

create table if not exists public.studio_rules (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  source_piece uuid references public.studio_pieces(id) on delete set null,
  status text not null default 'proposed',
  author text not null default 'Owner',
  created_at timestamptz not null default now()
);
alter table public.studio_rules drop constraint if exists studio_rules_status_check;
alter table public.studio_rules add constraint studio_rules_status_check check (status = any (array['proposed'::text, 'active'::text, 'off'::text]));

-- ------------------------------------------------------------------ studio: podcast hosting and feeds
create table if not exists public.studio_podcast_shows (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  author text not null default '',
  description text not null default '',
  language text not null default 'en',
  explicit boolean not null default false,
  show_type text not null default 'episodic',
  categories jsonb not null default '[]'::jsonb,
  artwork_path text,
  owner_name text not null default '',
  owner_email text not null default '',
  website text not null default '',
  copyright text not null default '',
  podcast_guid text not null,
  locked boolean not null default true,
  feed_base text,
  new_feed_url text,
  op3 boolean not null default false,
  platforms jsonb not null default '{}'::jsonb,
  move jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.studio_podcast_shows drop constraint if exists studio_podcast_shows_show_type_check;
alter table public.studio_podcast_shows add constraint studio_podcast_shows_show_type_check check (show_type = any (array['episodic'::text, 'serial'::text]));
alter table public.studio_podcast_shows drop constraint if exists studio_podcast_shows_slug_check;
alter table public.studio_podcast_shows add constraint studio_podcast_shows_slug_check check (slug ~ '^[a-z0-9-]+$'::text);
create unique index if not exists studio_podcast_shows_slug_key on public.studio_podcast_shows (slug);

create table if not exists public.studio_podcast_episodes (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.studio_podcast_shows(id) on delete cascade,
  episode_id uuid references public.studio_episodes(id) on delete set null,
  guid text not null,
  slug text not null,
  title text not null,
  summary text not null default '',
  notes text not null default '',
  status text not null default 'draft',
  published_at timestamptz,
  season integer,
  number integer,
  episode_type text not null default 'full',
  explicit boolean not null default false,
  audio_path text,
  audio_bytes bigint,
  audio_type text,
  duration integer,
  audio_job jsonb,
  artwork_path text,
  transcript_path text,
  guest text,
  guest_url text,
  youtube_url text,
  blog_url text,
  tags text[] not null default '{}'::text[],
  source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.studio_podcast_episodes drop constraint if exists studio_podcast_episodes_episode_type_check;
alter table public.studio_podcast_episodes add constraint studio_podcast_episodes_episode_type_check check (episode_type = any (array['full'::text, 'trailer'::text, 'bonus'::text]));
alter table public.studio_podcast_episodes drop constraint if exists studio_podcast_episodes_slug_check;
alter table public.studio_podcast_episodes add constraint studio_podcast_episodes_slug_check check (slug ~ '^[a-z0-9-]+$'::text);
alter table public.studio_podcast_episodes drop constraint if exists studio_podcast_episodes_status_check;
alter table public.studio_podcast_episodes add constraint studio_podcast_episodes_status_check check (status = any (array['draft'::text, 'ready'::text, 'published'::text]));
create unique index if not exists studio_podcast_episodes_show_id_guid_key on public.studio_podcast_episodes (show_id, guid);
create unique index if not exists studio_podcast_episodes_show_id_slug_key on public.studio_podcast_episodes (show_id, slug);
create index if not exists studio_podcast_episodes_episode_idx on public.studio_podcast_episodes (episode_id);
create index if not exists studio_podcast_episodes_feed_idx on public.studio_podcast_episodes (show_id, status, published_at desc);

-- ------------------------------------------------------------------ the brain (BRAIN.md)
-- Knowledge: brand brief, voice, offers, frameworks, proof, transcripts, past posts, the studio's own process docs.
create table if not exists public.brain_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  doc_type text not null default 'reference',
  summary text,
  content text not null default '',
  -- public: fine to quote anywhere; internal: the studio's own use (the default); confidential: never quoted, and the
  -- connector doesn't serve it at all unless STUDIO_BRAIN_CONFIDENTIAL=label
  sensitivity text not null default 'internal',
  -- where it came from: a file name, a URL, "interview with the owner, 2026-11-07"
  source text,
  -- e.g. guest-appearance (the owner on someone else's show: stories and voice only), course, podcast, testimonial
  tags text[] not null default '{}'::text[],
  -- part of get_brand_brief (the documents every prompt loads first), in brief_order
  in_brief boolean not null default false,
  brief_order integer not null default 100,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.brain_documents add column if not exists summary text;
alter table public.brain_documents add column if not exists source text;
alter table public.brain_documents add column if not exists tags text[] not null default '{}'::text[];
alter table public.brain_documents add column if not exists in_brief boolean not null default false;
alter table public.brain_documents add column if not exists brief_order integer not null default 100;
alter table public.brain_documents add column if not exists status text not null default 'active';
alter table public.brain_documents add column if not exists fts tsvector generated always as (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'C')
) stored;
alter table public.brain_documents drop constraint if exists brain_documents_doc_type_check;
alter table public.brain_documents add constraint brain_documents_doc_type_check check (doc_type = any (array[
  'brand-foundation'::text, 'voice'::text, 'offer'::text, 'audience'::text, 'framework'::text, 'case-study'::text,
  'testimonial'::text, 'transcript'::text, 'course'::text, 'post'::text, 'copy'::text, 'content-strategy'::text,
  'studio'::text, 'reference'::text]));
alter table public.brain_documents drop constraint if exists brain_documents_sensitivity_check;
alter table public.brain_documents add constraint brain_documents_sensitivity_check check (sensitivity = any (array['public'::text, 'internal'::text, 'confidential'::text]));
alter table public.brain_documents drop constraint if exists brain_documents_status_check;
alter table public.brain_documents add constraint brain_documents_status_check check (status = any (array['active'::text, 'archived'::text]));
create unique index if not exists brain_documents_title_key on public.brain_documents (title);
create index if not exists brain_documents_fts_idx on public.brain_documents using gin (fts);
create index if not exists brain_documents_brief_idx on public.brain_documents (in_brief, brief_order) where in_brief;

-- Photos, logos and brand images, stored in the private bucket brain-assets.
create table if not exists public.brain_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'photo',
  storage_path text not null,
  -- optional: a transparent PNG of the person cut out of the photo, and a person mask (white = person)
  cutout_path text,
  mask_path text,
  preview_path text,
  description text,
  setting text,
  topics text[] not null default '{}'::text[],
  mood text,
  expression text,
  -- where the person sits in the frame (thumbnails): L or R
  face_side text not null default 'R',
  -- the thumbnail hook types this photo plays: skeptic, verdict, warning, number, secret, smirk, how
  hook_types text[] not null default '{}'::text[],
  cover_ok boolean not null default true,
  thumb_ok boolean not null default true,
  -- true keeps it out of every tool (a photo only for reference)
  sensitive boolean not null default false,
  width integer,
  height integer,
  taken_at date,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);
alter table public.brain_assets add column if not exists cutout_path text;
alter table public.brain_assets add column if not exists mask_path text;
alter table public.brain_assets add column if not exists preview_path text;
alter table public.brain_assets add column if not exists hook_types text[] not null default '{}'::text[];
alter table public.brain_assets add column if not exists tags text[] not null default '{}'::text[];
alter table public.brain_assets drop constraint if exists brain_assets_kind_check;
alter table public.brain_assets add constraint brain_assets_kind_check check (kind = any (array['photo'::text, 'logo'::text, 'brand-image'::text, 'background'::text, 'font'::text, 'other'::text]));
alter table public.brain_assets drop constraint if exists brain_assets_face_side_check;
alter table public.brain_assets add constraint brain_assets_face_side_check check (face_side = any (array['L'::text, 'R'::text]));
create unique index if not exists brain_assets_name_key on public.brain_assets (name);
create index if not exists brain_assets_kind_idx on public.brain_assets (kind);

-- Which photos went out where, so photo_pick and thumb_pick rotate past recent ones.
create table if not exists public.brain_asset_usage (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.brain_assets(id) on delete cascade,
  format text not null,
  post_key text not null,
  status text not null default 'delivered',
  post text,
  created_at timestamptz not null default now()
);
alter table public.brain_asset_usage drop constraint if exists brain_asset_usage_format_check;
alter table public.brain_asset_usage add constraint brain_asset_usage_format_check check (format = any (array['cover'::text, 'thumbnail'::text]));
alter table public.brain_asset_usage drop constraint if exists brain_asset_usage_status_check;
alter table public.brain_asset_usage add constraint brain_asset_usage_status_check check (status = any (array['delivered'::text, 'published'::text]));
create index if not exists brain_asset_usage_recent_idx on public.brain_asset_usage (format, created_at desc);
create unique index if not exists brain_asset_usage_once on public.brain_asset_usage (asset_id, format, post_key, status);

-- ------------------------------------------------------------------ row level security: on, no policies
alter table public.studio_users enable row level security;
alter table public.studio_sessions enable row level security;
alter table public.studio_episodes enable row level security;
alter table public.studio_lead_magnets enable row level security;
alter table public.studio_pieces enable row level security;
alter table public.studio_notes enable row level security;
alter table public.studio_rules enable row level security;
alter table public.studio_podcast_shows enable row level security;
alter table public.studio_podcast_episodes enable row level security;
alter table public.brain_documents enable row level security;
alter table public.brain_assets enable row level security;
alter table public.brain_asset_usage enable row level security;

-- ------------------------------------------------------------------ functions
-- How much footage each episode keeps in storage (the Episodes page).
create or replace function public.studio_storage_by_episode()
returns table(episode_id uuid, bytes bigint, files integer)
language sql stable security definer set search_path to ''
as $$
  select split_part(o.name, '/', 2)::uuid as episode_id,
         coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as bytes,
         count(*)::integer as files
  from storage.objects o
  where o.bucket_id = 'studio-media'
    and o.name like 'episodes/%'
    and split_part(o.name, '/', 2) ~ '^[0-9a-f-]{36}$'
  group by 1
$$;

-- Full-text search over the brain: any of the words, best matches first (all the words rank highest), with a snippet.
create or replace function public.brain_search(q text, k integer default 8, with_confidential boolean default false)
returns table(id uuid, title text, doc_type text, summary text, sensitivity text, tags text[], source text, snippet text, rank real)
language sql stable security definer set search_path to ''
as $$
  with terms as (
    select string_agg(quote_literal(t.lexeme), ' | ') as expr
    from unnest(to_tsvector('english', coalesce(q, ''))) as t
  ), query as (
    select case when expr is null then null else to_tsquery('simple', expr) end as tq from terms
  )
  select d.id, d.title, d.doc_type, d.summary, d.sensitivity, d.tags, d.source,
         pg_catalog.ts_headline('english', d.content, query.tq, 'MaxFragments=2, MaxWords=40, MinWords=12, FragmentDelimiter= ... '),
         pg_catalog.ts_rank_cd(d.fts, query.tq)
  from public.brain_documents d, query
  where query.tq is not null
    and d.status = 'active'
    and (with_confidential or d.sensitivity <> 'confidential')
    and d.fts @@ query.tq
  order by 9 desc, d.title
  limit greatest(1, least(coalesce(k, 8), 20))
$$;

-- Only the server calls these.
revoke all on function public.studio_storage_by_episode() from public;
revoke all on function public.brain_search(text, integer, boolean) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.studio_storage_by_episode() from anon, authenticated';
    execute 'revoke all on function public.brain_search(text, integer, boolean) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.studio_storage_by_episode() to service_role';
    execute 'grant execute on function public.brain_search(text, integer, boolean) to service_role';
  end if;
end $$;

-- ------------------------------------------------------------------ storage
-- studio-media: private working files (uploads, footage, renders, the engines). After creating it, raise the upload
-- limit in Storage > Settings to your biggest episode file (episodes run to gigabytes).
-- podcast: public, so podcast apps can fetch the audio and artwork from the feed.
-- brain-assets: private, the brain's photos, logos and brand images (the studio-brain function signs links).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('studio-media', 'studio-media', false)
      on conflict (id) do update set public = false;
    insert into storage.buckets (id, name, public) values ('podcast', 'podcast', true)
      on conflict (id) do update set public = true;
    insert into storage.buckets (id, name, public) values ('brain-assets', 'brain-assets', false)
      on conflict (id) do update set public = false;
  end if;
end $$;
