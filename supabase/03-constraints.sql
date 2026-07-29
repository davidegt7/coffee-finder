-- Coffee Finder — step 3: constraints, RLS, triggers.
-- Run only AFTER 02-cleanup.sql: these CHECKs are validated against every
-- existing row the moment they're added.

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
