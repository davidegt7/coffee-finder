-- Coffee Finder — photos.
--
-- Run after the main setup. Idempotent.
--
-- One image per place, stored as a URL rather than a file: at this size a
-- storage bucket is machinery without a purpose, and the realistic sources
-- (an owner's own site, their Instagram, a photo you host) are all URLs already.
-- Swapping to Supabase Storage later only changes what goes in this column.
--
-- Deliberately NOT a stock photo field. A generic latte on a real café is a
-- small lie about a specific business, and this app's whole claim is that it
-- doesn't do that. A place with no photo shows a designed placeholder, which is
-- honest and reads fine.

alter table public.places add column if not exists photo_url text;
alter table public.places add column if not exists photo_credit text;

comment on column public.places.photo_url is
  'Absolute https URL. Empty is normal and renders a placeholder — never a stock image.';
comment on column public.places.photo_credit is
  'Who took it / where it came from. Shown with the photo when present.';

-- Only http(s), so a broken value can''t become a javascript: or data: URL in an
-- <img src> — the client is careful, but the database shouldn''t rely on that.
alter table public.places drop constraint if exists places_photo_url_http;
alter table public.places add constraint places_photo_url_http
  check (photo_url is null or photo_url ~ '^https?://');

-- Owners can offer one with their submission; an editor decides whether it ships.
alter table public.submissions add column if not exists photo_url text;

alter table public.submissions drop constraint if exists submissions_photo_url_http;
alter table public.submissions add constraint submissions_photo_url_http
  check (photo_url is null or photo_url ~ '^https?://');
-- Coffee Finder — photo storage.
--
-- Run after 05-photos.sql. Idempotent.
--
-- The URL column alone assumed photos already live somewhere. They don't: the
-- realistic source is someone standing in the café with a phone, and asking them
-- to host a JPEG first means it never happens. This bucket is what turns "add a
-- photo" into one tap.
--
-- Public read, editor-only write — same shape as `places` itself. A photo on a
-- listing is a claim about a business like any other.

insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do nothing;

-- Anyone may look; the map is public and so are its images.
drop policy if exists "place photos are publicly readable" on storage.objects;
create policy "place photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'place-photos');

drop policy if exists "editors upload place photos" on storage.objects;
create policy "editors upload place photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'place-photos' and public.is_editor());

-- Replacing a photo overwrites the same key, so update is needed alongside insert.
drop policy if exists "editors replace place photos" on storage.objects;
create policy "editors replace place photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'place-photos' and public.is_editor())
  with check (bucket_id = 'place-photos' and public.is_editor());

drop policy if exists "editors delete place photos" on storage.objects;
create policy "editors delete place photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'place-photos' and public.is_editor());
