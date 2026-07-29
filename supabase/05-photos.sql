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
