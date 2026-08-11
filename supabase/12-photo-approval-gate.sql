-- Coffee Finder — show real place photos only after recorded permission.
-- Run after 11-outreach-and-referrals.sql. Idempotent.

alter table public.places
  add column if not exists photo_approved boolean not null default false;

comment on column public.places.photo_approved is
  'Public-display gate. True only after permission evidence is recorded.';

-- Approval chooses the first requested photo for the listing. Removing or
-- changing approval immediately returns the public listing to its placeholder.
create or replace function public.sync_approved_place_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    update public.places
       set photo_url = coalesce(new.photo_urls[1], photo_url),
           photo_approved = coalesce(new.photo_urls[1], photo_url) is not null
     where id = new.place_id;
  else
    update public.places
       set photo_approved = false
     where id = new.place_id;
  end if;
  return new;
end;
$$;

drop trigger if exists photo_permissions_sync_public_photo on public.photo_permissions;
create trigger photo_permissions_sync_public_photo
  after insert or update of status, photo_urls on public.photo_permissions
  for each row execute function public.sync_approved_place_photo();

-- Apply any approvals that were recorded before this migration was installed.
update public.places as p
   set photo_url = coalesce(pp.photo_urls[1], p.photo_url),
       photo_approved = coalesce(pp.photo_urls[1], p.photo_url) is not null
  from public.photo_permissions as pp
 where pp.place_id = p.id
   and pp.status = 'approved';
