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
  city         text not null default 'Santiago',
  country      text not null default 'Chile',
  country_code text,
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

alter table public.submissions add column if not exists city text not null default 'Santiago';
alter table public.submissions add column if not exists country text not null default 'Chile';
alter table public.submissions add column if not exists country_code text;

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
