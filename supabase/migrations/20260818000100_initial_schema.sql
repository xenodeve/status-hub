-- Status Hub — initial schema.
--
-- The shape here is dictated by one constraint: Supabase Free stops writes at
-- 500 MB. Storing a row per check would reach that in about three months at ten
-- components, so nothing is written per check during normal operation. See
-- docs/agents/domain.md and docs/memory/platform-limits.md.

create type public.status as enum (
  'operational',    -- answered, inside the latency threshold
  'degraded',       -- answered slowly, or rate limited                theirs
  'down',           -- 5xx, timeout, connection failed                 theirs
  'misconfigured',  -- no valid credential, or we are asking wrongly   ours
  'unknown'         -- the check itself could not run                  ours
);

-- ---------------------------------------------------------------- registry --

create table public.sources (
  id          text primary key,
  name        text not null,
  adapter     text not null,
  config      jsonb not null default '{}'::jsonb,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.sources is
  'One provider we watch. Adding a source is a row here plus one adapter file.';

create table public.components (
  id             bigint generated always as identity primary key,
  source_id      text not null references public.sources(id) on delete cascade,
  -- Stable within the source. For a model this is the FAMILY, so a snapshot
  -- rotation keeps its history instead of starting an empty bar.
  key            text not null,
  name           text not null,
  -- The snapshot actually being served today, e.g. deepseek-v4-flash-0815.
  variant        text,
  thresholds     jsonb not null default '{"slowMs": 3500}'::jsonb,
  -- A newly discovered model is listed but not probed until someone says so:
  -- discovery must never silently start spending tokens on somebody else's
  -- gateway.
  probe_enabled  boolean not null default false,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  -- Set, never deleted. A retired model's history is the most useful history
  -- there is: it answers "did this get pulled because it kept failing".
  retired_at     timestamptz,
  unique (source_id, key)
);

-- -------------------------------------------------------------- live state --

create table public.component_state (
  component_id     bigint primary key references public.components(id) on delete cascade,
  status           public.status not null,
  latency_ms       integer,
  detail           text,
  -- Updated on EVERY check including green ones. This row is how the page tells
  -- "everything is fine" apart from "the collector died three hours ago", and
  -- it costs nothing because it is an update in place.
  last_checked_at  timestamptz not null,
  consecutive_ok   integer not null default 0,
  consecutive_bad  integer not null default 0
);

-- ----------------------------------------------------------------- history --

-- One row per component per day, updated in place. Every history bar at every
-- time range is drawn from this table, so ten years of history stays under
-- 20 MB and nothing ever needs pruning.
create table public.daily_rollups (
  component_id       bigint not null references public.components(id) on delete cascade,
  day                date not null,
  check_count        integer not null default 0,
  operational_count  integer not null default 0,
  degraded_count     integer not null default 0,
  down_count         integer not null default 0,
  -- unknown + misconfigured: checks that never reached them, so they are
  -- excluded from the uptime fraction rather than counted against the vendor.
  unreachable_count  integer not null default 0,
  worst_status       public.status not null,
  latency_buckets    jsonb not null default '{}'::jsonb,
  primary key (component_id, day)
);

comment on table public.daily_rollups is
  'A row exists only for a day we actually checked. Absence IS the no-data signal — never insert a placeholder row.';

create table public.status_events (
  id            bigint generated always as identity primary key,
  component_id  bigint not null references public.components(id) on delete cascade,
  at            timestamptz not null default now(),
  from_status   public.status,
  to_status     public.status not null,
  detail        text
);

create index status_events_component_at on public.status_events (component_id, at desc);

-- Full-resolution samples, written ONLY while a component is not operational.
-- Quiet during normal operation; detailed for exactly the window anyone wants
-- to look back at.
create table public.check_samples (
  id            bigint generated always as identity primary key,
  component_id  bigint not null references public.components(id) on delete cascade,
  at            timestamptz not null default now(),
  status        public.status not null,
  latency_ms    integer,
  detail        text
);

create index check_samples_component_at on public.check_samples (component_id, at desc);

-- --------------------------------------------------------------- incidents --

create table public.incidents (
  id            bigint generated always as identity primary key,
  component_id  bigint not null references public.components(id) on delete cascade,
  origin        text not null check (origin in ('vendor', 'derived')),
  -- The vendor's own incident id, so re-reading their feed updates rather than
  -- duplicates. Null for derived.
  vendor_key    text,
  title         text not null,
  detail        text,
  severity      text not null default 'minor' check (severity in ('minor', 'major', 'critical')),
  started_at    timestamptz not null,
  ended_at      timestamptz
);

create unique index incidents_vendor_key
  on public.incidents (component_id, vendor_key)
  where vendor_key is not null;

-- THE anti-flood rule. The reference implementation opened a fresh incident on
-- every slow check and produced sixteen in one day for one model, each firing
-- its own alert. At most one derived incident per component may be open; a
-- continuing problem extends that row instead of starting another.
create unique index incidents_one_open_derived
  on public.incidents (component_id)
  where origin = 'derived' and ended_at is null;

create index incidents_component_started on public.incidents (component_id, started_at desc);

-- --------------------------------------------------------------------- RLS --

-- The page is public and read-only. Writes come from the collector, which runs
-- as service_role and bypasses these policies.
alter table public.sources         enable row level security;
alter table public.components      enable row level security;
alter table public.component_state enable row level security;
alter table public.daily_rollups   enable row level security;
alter table public.status_events   enable row level security;
alter table public.check_samples   enable row level security;
alter table public.incidents       enable row level security;

create policy "public read" on public.sources         for select to anon, authenticated using (true);
create policy "public read" on public.components      for select to anon, authenticated using (true);
create policy "public read" on public.component_state for select to anon, authenticated using (true);
create policy "public read" on public.daily_rollups   for select to anon, authenticated using (true);
create policy "public read" on public.status_events   for select to anon, authenticated using (true);
create policy "public read" on public.check_samples   for select to anon, authenticated using (true);
create policy "public read" on public.incidents       for select to anon, authenticated using (true);
