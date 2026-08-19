-- Keep the owner's coffee/product photo separate from photos of the place.
alter table public.submissions
  add column if not exists coffee_photo_url text;
