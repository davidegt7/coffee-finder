-- Coffee Finder — simpler owner submissions and anonymous photo intake.
--
-- Owners choose only the broad public-search intents. These three fields keep
-- the new information structured while old submissions remain valid.

alter table public.submissions
  add column if not exists coffee_brand text not null default '';

alter table public.submissions
  add column if not exists specialty_coffee boolean;

alter table public.submissions
  add column if not exists photo_urls text[] not null default '{}';

-- Preserve the original single-photo submissions in the new collection.
update public.submissions
set photo_urls = array[photo_url]
where photo_url is not null
  and cardinality(photo_urls) = 0;

-- Owner uploads live separately from editor-approved public listing photos.
-- The bucket accepts only the compressed JPEGs produced by the client, up to
-- 5 MB each. Anonymous users cannot replace or delete anything.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'submission-photos',
  'submission-photos',
  true,
  5242880,
  array['image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "submission photos are publicly readable" on storage.objects;
create policy "submission photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'submission-photos');

drop policy if exists "owners upload submission photos" on storage.objects;
create policy "owners upload submission photos"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'submission-photos'
    and (storage.foldername(name))[1] = 'submissions'
    and lower(storage.extension(name)) in ('jpg', 'jpeg')
  );
