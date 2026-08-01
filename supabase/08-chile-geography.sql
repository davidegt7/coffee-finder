-- Coffee Finder now covers Chile, not only Santiago.
-- Keep a broad geographic sanity check (including Chilean islands) while
-- allowing places such as Villarrica to be saved.

alter table public.places drop constraint if exists places_in_santiago;
alter table public.places drop constraint if exists places_in_chile_extent;
alter table public.places add constraint places_in_chile_extent
  check (lat between -60 and -15 and lng between -115 and -65);
