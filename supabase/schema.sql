-- Coffee Finder — database schema.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- This reuses the SAME Supabase project as the old Vital Map (free tier allows
-- only two active projects, and Vision holds the other slot). The table is
-- migrated in place rather than recreated, so the editors allowlist, the auth
-- users, and Coffee Culture Coffee Roasters all survive.
--
-- The access rule is unchanged and is the whole point of the file:
--   * anyone, signed in or not, can READ places — it's a public map
--   * only an allowlisted editor can WRITE one
--
-- A bad write here is milder than on a dietary map — but `glutenFree` survived
-- the pivot, so a coeliac can still be hurt by a careless row. The allowlist stays.

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

-- --- constraints ------------------------------------------------------------

alter table public.places drop constraint if exists places_category_check;
alter table public.places drop constraint if exists places_category_valid;
alter table public.places add constraint places_category_valid
  check (category in ('cafe','roastery','bakery','shop','cart'));

-- Santiago bounding box. The same guard as scripts/check-data.mjs, enforced
-- where it can't be bypassed: a geocoder mishap once put a real lookup 17km
-- away in La Pintana, and it looked perfectly plausible.
alter table public.places drop constraint if exists places_in_santiago;
alter table public.places add constraint places_in_santiago
  check (lat between -33.65 and -33.30 and lng between -70.85 and -70.50);

-- A claim above 'unverified' must cite a source. An unsourced "verified" is
-- exactly the record that misleads someone, so it must be impossible to insert,
-- not merely discouraged.
create or replace function public.claims_are_sourced(d jsonb)
returns boolean language sql immutable as $$
  select coalesce(bool_and(
    case
      when (v->>'confidence') in ('verified','claimed')
        then coalesce(nullif(trim(v->>'source'), ''), null) is not null
      else true
    end
  ), true)
  from jsonb_each(d) as t(k, v);
$$;

alter table public.places drop constraint if exists places_claims_sourced;
alter table public.places add constraint places_claims_sourced
  check (public.claims_are_sourced(claims));

-- Flags are a closed vocabulary; a typo'd flag would silently never match.
alter table public.places drop constraint if exists places_flags_valid;
alter table public.places add constraint places_flags_valid
  check (flags <@ array[
    'filterMethods','sellsBeans','grindsBeans',
    'breakfast','brunch','lunch',
    'wifi','outlets','laptopFriendly'
  ]::text[]);

create index if not exists places_category_idx on public.places (category);

-- ---------------------------------------------------------------- is_editor

-- security definer so the policy can read `editors` without RLS on `editors`
-- recursing back into this check. Standard Supabase pattern.
create or replace function public.is_editor()
returns boolean language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.editors
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------- RLS

alter table public.places  enable row level security;
alter table public.editors enable row level security;

drop policy if exists "places readable by everyone" on public.places;
create policy "places readable by everyone"
  on public.places for select using (true);

drop policy if exists "only editors insert places" on public.places;
create policy "only editors insert places"
  on public.places for insert to authenticated with check (public.is_editor());

drop policy if exists "only editors update places" on public.places;
create policy "only editors update places"
  on public.places for update to authenticated
  using (public.is_editor()) with check (public.is_editor());

-- Delete IS allowed for editors here, unlike Vital Map — the pivot needs the 25
-- health-food places gone, and a café that closes should be removable without a
-- dashboard trip. Still editors-only.
drop policy if exists "only editors delete places" on public.places;
create policy "only editors delete places"
  on public.places for delete to authenticated using (public.is_editor());

drop policy if exists "editors can see the allowlist" on public.editors;
create policy "editors can see the allowlist"
  on public.editors for select to authenticated using (public.is_editor());

-- ---------------------------------------------------------------- updated_at

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end;
$$;

drop trigger if exists places_touch on public.places;
create trigger places_touch
  before insert or update on public.places
  for each row execute function public.touch_updated_at();
