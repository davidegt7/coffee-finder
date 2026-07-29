-- Coffee Finder — step 1: tables and column migration.
-- Deliberately contains NO constraints. Existing rows must be made to
-- conform (see 02-cleanup.sql) before 03-constraints.sql can run, or
-- Postgres rejects the whole batch: a category CHECK added while the old
-- grocery/market/restaurant rows are still present fails with 23514.

-- ---------------------------------------------------------------- editors
-- (unchanged from Vital Map; recreated here so this file stands alone)

create table if not exists public.editors (
  email    text primary key,
  name     text,
  added_at timestamptz not null default now()
);

comment on table public.editors is
  'Allowlist. Being signed in is not enough to write — your email must be in here.';

insert into public.editors (email, name)
values ('david.egt7@gmail.com', 'David')
on conflict (email) do nothing;

-- ---------------------------------------------------------------- places

create table if not exists public.places (
  id         text primary key,
  name       text not null,
  category   text not null,
  lat        double precision not null,
  lng        double precision not null,
  address    text,
  comuna     text,
  city       text not null default 'Santiago',
  website    text,
  instagram  text,
  items      text[] not null default '{}',
  claims     jsonb  not null default '{}'::jsonb,
  flags      text[] not null default '{}',
  caveat     text,
  sources    text[] not null default '{}',
  added_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- --- migration from the Vital Map shape -------------------------------------
-- `diet` (4 dietary axes) becomes `claims` (4 coffee/food axes), and `flags`
-- is new. Guarded so a fresh install and a migration both work.

alter table public.places add column if not exists claims jsonb  not null default '{}'::jsonb;
alter table public.places add column if not exists flags  text[] not null default '{}';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'places' and column_name = 'diet'
  ) then
    -- Carry over only what still means the same thing. glutenFree and
    -- seedOilFree survive the pivot verbatim; sugarFree and organic are dropped
    -- because "organic coffee shop" is a different claim from "organic grocer"
    -- and pretending otherwise would launder a stale assertion into a new app.
    update public.places
    set claims = jsonb_strip_nulls(jsonb_build_object(
      'glutenFree',   diet -> 'glutenFree',
      'seedOilFree',  diet -> 'seedOilFree'
    ))
    where claims = '{}'::jsonb and diet is not null;

    alter table public.places drop column diet;
  end if;
end $$;

-- Every claim key must be present, even if unknown — an absent key and an
-- explicit "nobody has checked" read identically in the UI, and only one of
-- them is honest.
update public.places
set claims = coalesce(claims, '{}'::jsonb)
           || jsonb_build_object('roastsOnSite',
                coalesce(claims -> 'roastsOnSite', '{"scope":"unknown","confidence":"unverified"}'::jsonb))
           || jsonb_build_object('specialty',
                coalesce(claims -> 'specialty',    '{"scope":"unknown","confidence":"unverified"}'::jsonb))
           || jsonb_build_object('glutenFree',
                coalesce(claims -> 'glutenFree',   '{"scope":"unknown","confidence":"unverified"}'::jsonb))
           || jsonb_build_object('seedOilFree',
                coalesce(claims -> 'seedOilFree',  '{"scope":"unknown","confidence":"unverified"}'::jsonb));

