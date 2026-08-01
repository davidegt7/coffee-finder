-- ============================================================
-- Coffee Finder — complete setup. Paste the WHOLE thing, run once.
--
-- Order is load-bearing, in both directions:
--   * OLD constraints must be dropped before data is touched (the previous
--     app's inline category CHECK rejects 'roastery').
--   * NEW constraints must be added after, since a CHECK is validated
--     against every existing row the instant it is created.
--
-- No BEGIN/COMMIT: the Supabase SQL editor wraps the buffer in its own
-- transaction, and a stray COMMIT closes it early.
-- ============================================================

-- ========== tables, unshackle, diet→claims ==========
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

-- ---------------------------------------------------------------- unshackle
--
-- Drop every constraint before touching data. The previous app declared its
-- category CHECK inline, so Postgres auto-named it `places_category_check` —
-- and it still enforces the food vocabulary (restaurant/grocery/market/…).
-- Retagging Coffee Culture as a 'roastery' in step 2 fails against it with a
-- 23514 unless it's gone first.
--
-- The table stays unconstrained for exactly two steps; 03-constraints.sql puts
-- the real rules back, validated against rows that by then conform.

alter table public.places drop constraint if exists places_category_check;
alter table public.places drop constraint if exists places_category_valid;
alter table public.places drop constraint if exists places_in_santiago;
alter table public.places drop constraint if exists places_claims_sourced;
alter table public.places drop constraint if exists places_flags_valid;

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


-- ========== remove old data, keep Coffee Culture ==========
-- Coffee Finder — step 2: make existing rows conform.
--
-- Runs BETWEEN 01-tables.sql and 03-constraints.sql, and the position is
-- load-bearing: the category CHECK in step 3 is validated against every row
-- present at that moment, so the old grocery/market/restaurant rows have to be
-- gone first.
--
-- Clears the old Vital Map health-food dataset and keeps Coffee Culture Coffee
-- Roasters — the one genuinely-coffee place, added by David through the editor.
-- Then re-homes it into the new schema: it arrives with empty claims (its old
-- sugarFree/organic assertions were about a grocery context and don't transfer),
-- so it lands honestly as "nobody has checked" rather than laundering a stale
-- claim into a new app.


-- Everything that isn't the coffee roaster.
delete from public.places
where id <> 'cur_coffee_culture_coffee_roasters';

-- Re-file it as a roastery and give it the full claim set, all unknown.
update public.places
set category = 'roastery',
    claims = jsonb_build_object(
      'roastsOnSite', '{"scope":"unknown","confidence":"unverified"}'::jsonb,
      'specialty',    '{"scope":"unknown","confidence":"unverified"}'::jsonb,
      'glutenFree',   '{"scope":"unknown","confidence":"unverified"}'::jsonb,
      'seedOilFree',  '{"scope":"unknown","confidence":"unverified"}'::jsonb
    ),
    flags = '{}'::text[]
where id = 'cur_coffee_culture_coffee_roasters';

-- ========== constraints, RLS, triggers ==========
-- Coffee Finder — step 3: constraints, RLS, triggers.
-- Run only AFTER 02-cleanup.sql: these CHECKs are validated against every
-- existing row the moment they're added.

-- --- constraints ------------------------------------------------------------

alter table public.places drop constraint if exists places_category_check;
alter table public.places drop constraint if exists places_category_valid;
alter table public.places add constraint places_category_valid
  check (category in ('cafe','roastery','bakery','shop','cart'));

-- Broad Chile extent, including the Pacific islands. Exact country filtering
-- happens in the geocoder; this still rejects wildly impossible coordinates.
alter table public.places drop constraint if exists places_in_santiago;
alter table public.places drop constraint if exists places_in_chile_extent;
alter table public.places add constraint places_in_chile_extent
  check (lat between -60 and -15 and lng between -115 and -65);

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

-- ========== seed 8 coffee places ==========
-- Generated by scripts/seed-sql.mjs — do not edit by hand.
-- 8 places from public/data/places.json


insert into public.places (id, name, category, lat, lng, address, comuna, city, website, instagram, items, claims, flags, caveat, sources) values (
  'cur_cafe_cascanueces', U&'Caf\00e9 Cascanueces', 'roastery', -33.4273342, -70.6190283,
  'General Flores', 'Providencia', 'Santiago', null, null,
  array['Espresso','Grano']::text[], U&'{"roastsOnSite":{"scope":"all","confidence":"claimed","source":"https://cafecascanueces.cl/","note":"Se presentan como caf\00e9 artesanal tostado por ellos.","checkedAt":"2026-07-22"},"specialty":{"scope":"all","confidence":"claimed","source":"https://cafecascanueces.cl/","checkedAt":"2026-07-22"},"glutenFree":{"scope":"unknown","confidence":"unverified"},"seedOilFree":{"scope":"unknown","confidence":"unverified"}}'::jsonb, array['sellsBeans']::text[], U&'El geocodificador ubic\00f3 la calle pero no el n\00famero \2014 confirma la direcci\00f3n antes de ir.', array['https://cafecascanueces.cl/','https://www.openstreetmap.org/way/20907275']::text[]
) on conflict (id) do update set
  name = excluded.name, category = excluded.category, lat = excluded.lat, lng = excluded.lng,
  address = excluded.address, comuna = excluded.comuna, city = excluded.city,
  website = excluded.website, instagram = excluded.instagram, items = excluded.items,
  claims = excluded.claims, flags = excluded.flags, caveat = excluded.caveat,
  sources = excluded.sources;

insert into public.places (id, name, category, lat, lng, address, comuna, city, website, instagram, items, claims, flags, caveat, sources) values (
  'cur_cafe_triciclo', U&'Caf\00e9 Triciclo', 'cafe', -33.4357263, -70.6457713,
  'Santo Domingo 598', 'Santiago', 'Santiago', null, null,
  array['Espresso']::text[], '{"roastsOnSite":{"scope":"unknown","confidence":"unverified"},"specialty":{"scope":"all","confidence":"claimed","source":"https://www.cafetriciclo.cl/","checkedAt":"2026-07-22"},"glutenFree":{"scope":"unknown","confidence":"unverified"},"seedOilFree":{"scope":"unknown","confidence":"unverified"}}'::jsonb, '{}', U&'Su tostadur\00eda (3 Ciclos) es una operaci\00f3n aparte \2014 no est\00e1 confirmado que tuesten en este local.', array['https://www.cafetriciclo.cl/','https://www.openstreetmap.org/way/409005085']::text[]
) on conflict (id) do update set
  name = excluded.name, category = excluded.category, lat = excluded.lat, lng = excluded.lng,
  address = excluded.address, comuna = excluded.comuna, city = excluded.city,
  website = excluded.website, instagram = excluded.instagram, items = excluded.items,
  claims = excluded.claims, flags = excluded.flags, caveat = excluded.caveat,
  sources = excluded.sources;

insert into public.places (id, name, category, lat, lng, address, comuna, city, website, instagram, items, claims, flags, caveat, sources) values (
  'cur_cafe_triciclo_nunoa', U&'Caf\00e9 Triciclo \00d1u\00f1oa', 'cafe', -33.448738, -70.6236763,
  'Girardi 1569', U&'\00d1u\00f1oa', 'Santiago', null, null,
  array['Espresso']::text[], '{"roastsOnSite":{"scope":"unknown","confidence":"unverified"},"specialty":{"scope":"all","confidence":"claimed","source":"https://www.cafetriciclo.cl/","checkedAt":"2026-07-22"},"glutenFree":{"scope":"unknown","confidence":"unverified"},"seedOilFree":{"scope":"unknown","confidence":"unverified"}}'::jsonb, '{}', null, array['https://www.cafetriciclo.cl/','https://www.openstreetmap.org/node/11515170669']::text[]
) on conflict (id) do update set
  name = excluded.name, category = excluded.category, lat = excluded.lat, lng = excluded.lng,
  address = excluded.address, comuna = excluded.comuna, city = excluded.city,
  website = excluded.website, instagram = excluded.instagram, items = excluded.items,
  claims = excluded.claims, flags = excluded.flags, caveat = excluded.caveat,
  sources = excluded.sources;

insert into public.places (id, name, category, lat, lng, address, comuna, city, website, instagram, items, claims, flags, caveat, sources) values (
  'cur_la_huerfana', U&'La Hu\00e9rfana', 'cafe', -33.4402327, -70.658112,
  U&'Hu\00e9rfanos 1515', 'Santiago', 'Santiago', null, null,
  array['Espresso']::text[], U&'{"roastsOnSite":{"scope":"unknown","confidence":"unverified"},"specialty":{"scope":"all","confidence":"claimed","source":"https://www.terra.cl/nacionales/2026/1/13/cuales-son-las-mejores-cafeterias-de-santiago-por-que-fueron-reconocidas-nivel-mundial-44289.html","note":"Reconocida entre las mejores cafeter\00edas de Chile, The Best Coffee Shops 2025.","checkedAt":"2026-07-22"},"glutenFree":{"scope":"unknown","confidence":"unverified"},"seedOilFree":{"scope":"unknown","confidence":"unverified"}}'::jsonb, '{}', U&'Est\00e1 dentro del Palacio Pereira. Tienen un segundo local en Barrio Italia.', array['https://www.terra.cl/nacionales/2026/1/13/cuales-son-las-mejores-cafeterias-de-santiago-por-que-fueron-reconocidas-nivel-mundial-44289.html','https://www.openstreetmap.org/node/10695868007']::text[]
) on conflict (id) do update set
  name = excluded.name, category = excluded.category, lat = excluded.lat, lng = excluded.lng,
  address = excluded.address, comuna = excluded.comuna, city = excluded.city,
  website = excluded.website, instagram = excluded.instagram, items = excluded.items,
  claims = excluded.claims, flags = excluded.flags, caveat = excluded.caveat,
  sources = excluded.sources;

insert into public.places (id, name, category, lat, lng, address, comuna, city, website, instagram, items, claims, flags, caveat, sources) values (
  'cur_la_huerfana_barrio_italia', U&'La Hu\00e9rfana Barrio Italia', 'cafe', -33.4456672, -70.6230863,
  'Avenida Santa Isabel 598', 'Providencia', 'Santiago', null, null,
  array['Espresso']::text[], '{"roastsOnSite":{"scope":"unknown","confidence":"unverified"},"specialty":{"scope":"all","confidence":"claimed","source":"https://www.terra.cl/nacionales/2026/1/13/cuales-son-las-mejores-cafeterias-de-santiago-por-que-fueron-reconocidas-nivel-mundial-44289.html","checkedAt":"2026-07-22"},"glutenFree":{"scope":"unknown","confidence":"unverified"},"seedOilFree":{"scope":"unknown","confidence":"unverified"}}'::jsonb, '{}', null, array['https://www.terra.cl/nacionales/2026/1/13/cuales-son-las-mejores-cafeterias-de-santiago-por-que-fueron-reconocidas-nivel-mundial-44289.html','https://www.openstreetmap.org/way/108391528']::text[]
) on conflict (id) do update set
  name = excluded.name, category = excluded.category, lat = excluded.lat, lng = excluded.lng,
  address = excluded.address, comuna = excluded.comuna, city = excluded.city,
  website = excluded.website, instagram = excluded.instagram, items = excluded.items,
  claims = excluded.claims, flags = excluded.flags, caveat = excluded.caveat,
  sources = excluded.sources;

insert into public.places (id, name, category, lat, lng, address, comuna, city, website, instagram, items, claims, flags, caveat, sources) values (
  'cur_la_pastora_coffee_antonio_varas', U&'La Pastora Coffee \2014 Antonio Varas', 'cafe', -33.443055, -70.6124173,
  'Avenida Antonio Varas', 'Providencia', 'Santiago', null, null,
  array['Espresso','Grano']::text[], U&'{"roastsOnSite":{"scope":"none","confidence":"claimed","source":"https://www.theclinic.cl/2026/07/22/la-pastora-coffee-alista-una-cuarta-apertura-en-providencia-la-cafeteria-inaugurara-este-mes-un-local-frente-a-parque-bustamante/","note":"Tuestan en su tostadur\00eda de Barrio Italia, no en este local.","checkedAt":"2026-07-22"},"specialty":{"scope":"all","confidence":"claimed","source":"https://www.theclinic.cl/2026/07/22/la-pastora-coffee-alista-una-cuarta-apertura-en-providencia-la-cafeteria-inaugurara-este-mes-un-local-frente-a-parque-bustamante/","checkedAt":"2026-07-22"},"glutenFree":{"scope":"unknown","confidence":"unverified"},"seedOilFree":{"scope":"unknown","confidence":"unverified"}}'::jsonb, array['sellsBeans']::text[], null, array['https://www.theclinic.cl/2026/07/22/la-pastora-coffee-alista-una-cuarta-apertura-en-providencia-la-cafeteria-inaugurara-este-mes-un-local-frente-a-parque-bustamante/','https://www.openstreetmap.org/way/242748642']::text[]
) on conflict (id) do update set
  name = excluded.name, category = excluded.category, lat = excluded.lat, lng = excluded.lng,
  address = excluded.address, comuna = excluded.comuna, city = excluded.city,
  website = excluded.website, instagram = excluded.instagram, items = excluded.items,
  claims = excluded.claims, flags = excluded.flags, caveat = excluded.caveat,
  sources = excluded.sources;

insert into public.places (id, name, category, lat, lng, address, comuna, city, website, instagram, items, claims, flags, caveat, sources) values (
  'cur_la_pastora_coffee_suecia', U&'La Pastora Coffee \2014 Suecia', 'cafe', -33.4229862, -70.6068029,
  'Avenida Suecia 264', 'Providencia', 'Santiago', null, null,
  array['Espresso','Grano']::text[], U&'{"roastsOnSite":{"scope":"none","confidence":"claimed","source":"https://www.theclinic.cl/2026/07/22/la-pastora-coffee-alista-una-cuarta-apertura-en-providencia-la-cafeteria-inaugurara-este-mes-un-local-frente-a-parque-bustamante/","note":"Tuestan en su tostadur\00eda de Barrio Italia, no en este local.","checkedAt":"2026-07-22"},"specialty":{"scope":"all","confidence":"claimed","source":"https://www.theclinic.cl/2026/07/22/la-pastora-coffee-alista-una-cuarta-apertura-en-providencia-la-cafeteria-inaugurara-este-mes-un-local-frente-a-parque-bustamante/","checkedAt":"2026-07-22"},"glutenFree":{"scope":"unknown","confidence":"unverified"},"seedOilFree":{"scope":"unknown","confidence":"unverified"}}'::jsonb, array['sellsBeans']::text[], null, array['https://www.theclinic.cl/2026/07/22/la-pastora-coffee-alista-una-cuarta-apertura-en-providencia-la-cafeteria-inaugurara-este-mes-un-local-frente-a-parque-bustamante/','https://www.openstreetmap.org/node/2967020280']::text[]
) on conflict (id) do update set
  name = excluded.name, category = excluded.category, lat = excluded.lat, lng = excluded.lng,
  address = excluded.address, comuna = excluded.comuna, city = excluded.city,
  website = excluded.website, instagram = excluded.instagram, items = excluded.items,
  claims = excluded.claims, flags = excluded.flags, caveat = excluded.caveat,
  sources = excluded.sources;

insert into public.places (id, name, category, lat, lng, address, comuna, city, website, instagram, items, claims, flags, caveat, sources) values (
  'cur_wonderland_cafe', U&'Wonderland Caf\00e9', 'cafe', -33.4380561, -70.642146,
  'Rosal 361', 'Santiago', 'Santiago', null, null,
  array['Espresso','Flat white','Latte']::text[], U&'{"roastsOnSite":{"scope":"unknown","confidence":"unverified"},"specialty":{"scope":"all","confidence":"claimed","source":"https://www.fmdos.cl/noticias/cafeterias-en-santiago-donde-comer-precios-y-especialidades","note":"Cafeter\00eda tem\00e1tica en Barrio Lastarria con caf\00e9 de especialidad.","checkedAt":"2026-07-22"},"glutenFree":{"scope":"unknown","confidence":"unverified"},"seedOilFree":{"scope":"unknown","confidence":"unverified"}}'::jsonb, '{}', null, array['https://www.fmdos.cl/noticias/cafeterias-en-santiago-donde-comer-precios-y-especialidades','https://www.openstreetmap.org/way/728835919']::text[]
) on conflict (id) do update set
  name = excluded.name, category = excluded.category, lat = excluded.lat, lng = excluded.lng,
  address = excluded.address, comuna = excluded.comuna, city = excluded.city,
  website = excluded.website, instagram = excluded.instagram, items = excluded.items,
  claims = excluded.claims, flags = excluded.flags, caveat = excluded.caveat,
  sources = excluded.sources;


-- expect: 8 rows
-- select count(*) from public.places;

-- ========== reviews + submissions ==========
-- Coffee Finder — reviews and owner submissions.
--
-- Run AFTER supabase/schema.sql. Idempotent: safe to re-run.
--
-- Two tables with deliberately opposite access rules, because they answer
-- opposite questions:
--
--   reviews     — public to READ, sign-in to WRITE. Anonymous writes to a public
--                 endpoint are a spam magnet, and an unattributable review is
--                 worth little anyway. Magic-link sign-in is the cheapest real
--                 identity available and it's already built.
--
--   submissions — anyone may WRITE, only editors may READ. It's an inbox, not
--                 content. A café owner shouldn't need an account to ask to be
--                 listed, and nothing they send appears on the map until an
--                 editor promotes it.

-- ---------------------------------------------------------------- reviews

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  place_id    text not null references public.places(id) on delete cascade,
  rating      int  not null check (rating between 1 and 5),
  body        text not null check (length(trim(body)) >= 3),
  author      text not null default 'Anónimo',
  author_email text,
  /** Which claims this reviewer speaks to — a coeliac's GF note carries weight. */
  speaks_to   text[] not null default '{}',
  /**
   * Set by trigger from the editors allowlist, NEVER from the client.
   *
   * If the client could send this, "team review" would mean "whoever ticked the
   * box", which is the same failure as a self-asserted `verified` claim. The
   * badge is only worth something if it can't be self-awarded.
   */
  is_team     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists reviews_place_idx on public.reviews (place_id, created_at desc);

create or replace function public.stamp_review()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  new.author_email := auth.jwt() ->> 'email';
  new.is_team := public.is_editor();     -- authoritative, not client-supplied
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists reviews_stamp on public.reviews;
create trigger reviews_stamp
  before insert on public.reviews
  for each row execute function public.stamp_review();

alter table public.reviews enable row level security;

drop policy if exists "reviews readable by everyone" on public.reviews;
create policy "reviews readable by everyone"
  on public.reviews for select using (true);

drop policy if exists "signed-in users write reviews" on public.reviews;
create policy "signed-in users write reviews"
  on public.reviews for insert to authenticated with check (true);

-- You may delete your own; editors may delete any (moderation).
drop policy if exists "authors and editors delete reviews" on public.reviews;
create policy "authors and editors delete reviews"
  on public.reviews for delete to authenticated
  using (author_email = (auth.jwt() ->> 'email') or public.is_editor());

-- ---------------------------------------------------------------- submissions

create table if not exists public.submissions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) >= 2),
  category     text not null,
  address      text not null,
  comuna       text,
  website      text,
  instagram    text,
  contact_email text not null,
  contact_name text,
  /** What the owner asserts. Stored raw — an owner's word is a 'claimed'
   *  source at best, and promoting it is an editor's judgement, not an insert. */
  asserts      text[] not null default '{}',
  items        text[] not null default '{}',
  note         text,
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  reviewed_by  text,
  reviewed_at  timestamptz
);

create index if not exists submissions_status_idx on public.submissions (status, created_at desc);

alter table public.submissions enable row level security;

-- Anyone, signed in or not, may submit. This is the one open write in the app
-- and it's deliberately a dead end: nothing here renders publicly, so the worst
-- a spammer achieves is noise in a queue only editors ever open.
drop policy if exists "anyone can submit a cafe" on public.submissions;
create policy "anyone can submit a cafe"
  on public.submissions for insert to anon, authenticated with check (true);

drop policy if exists "only editors read submissions" on public.submissions;
create policy "only editors read submissions"
  on public.submissions for select to authenticated using (public.is_editor());

drop policy if exists "only editors update submissions" on public.submissions;
create policy "only editors update submissions"
  on public.submissions for update to authenticated
  using (public.is_editor()) with check (public.is_editor());

drop policy if exists "only editors delete submissions" on public.submissions;
create policy "only editors delete submissions"
  on public.submissions for delete to authenticated using (public.is_editor());
