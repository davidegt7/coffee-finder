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
