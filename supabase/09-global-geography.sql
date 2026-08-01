-- Coffee Finder — global geography.
-- Existing records predate country fields and are all Chilean. Backfill those,
-- then require every future place to carry an ISO country code.

alter table public.places add column if not exists country text;
alter table public.places add column if not exists country_code text;

update public.places
set country = coalesce(nullif(trim(country), ''), 'Chile'),
    country_code = coalesce(nullif(lower(trim(country_code)), ''), 'cl');

alter table public.places alter column country set not null;
alter table public.places alter column country_code set not null;
alter table public.places alter column city drop default;
alter table public.places alter column country drop default;
alter table public.places alter column country_code drop default;

alter table public.places drop constraint if exists places_in_santiago;
alter table public.places drop constraint if exists places_in_chile_extent;
alter table public.places drop constraint if exists places_on_earth;
alter table public.places add constraint places_on_earth
  check (lat between -90 and 90 and lng between -180 and 180);

alter table public.places drop constraint if exists places_country_code_valid;
alter table public.places add constraint places_country_code_valid
  check (country_code ~ '^[a-z]{2}$');

create index if not exists places_country_city_idx
  on public.places (country_code, city);

-- Owner submissions must carry enough geography to be reviewed globally.
alter table public.submissions add column if not exists city text;
alter table public.submissions add column if not exists country text;
alter table public.submissions add column if not exists country_code text;

update public.submissions
set city = coalesce(nullif(trim(city), ''), 'Santiago'),
    country = coalesce(nullif(trim(country), ''), 'Chile'),
    country_code = coalesce(nullif(lower(trim(country_code)), ''), 'cl');

alter table public.submissions alter column city set not null;
alter table public.submissions alter column country set not null;

-- The private rejection ledger also needs geography in its identity; otherwise
-- an unrelated café with the same name in another country is skipped forever.
alter table public.research_ledger add column if not exists city text;
alter table public.research_ledger add column if not exists city_key text not null default '';
alter table public.research_ledger add column if not exists country text;
alter table public.research_ledger add column if not exists country_code text not null default '';

update public.research_ledger
set country = coalesce(nullif(trim(country), ''), 'Chile'),
    country_code = coalesce(nullif(lower(trim(country_code)), ''), 'cl'),
    city = coalesce(city, ''),
    city_key = coalesce(city_key, '');

alter table public.research_ledger
  drop constraint if exists research_ledger_name_key_comuna_key_key;
alter table public.research_ledger
  drop constraint if exists research_ledger_global_identity;
alter table public.research_ledger
  add constraint research_ledger_global_identity
  unique (name_key, comuna_key, city_key, country_code);
