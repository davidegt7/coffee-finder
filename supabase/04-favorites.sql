-- Coffee Finder — favorites.
--
-- Run after the main setup. Idempotent.
--
-- The strictest table in the app: a row is visible only to the person who
-- created it. Places and reviews are public by design; what someone has saved
-- is nobody else's business, and RLS is what enforces that rather than the UI
-- politely not asking.

create table if not exists public.favorites (
  -- Defaulted from the JWT so the client never supplies it. If it could, the
  -- insert policy would be the only thing standing between a user and writing
  -- rows into someone else's list — and a default plus a policy is two locks.
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  place_id   text not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Composite key: saving twice is a no-op rather than a duplicate row.
  primary key (user_id, place_id)
);

create index if not exists favorites_user_idx on public.favorites (user_id, created_at desc);

alter table public.favorites enable row level security;

drop policy if exists "read own favorites" on public.favorites;
create policy "read own favorites"
  on public.favorites for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "insert own favorites" on public.favorites;
create policy "insert own favorites"
  on public.favorites for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "delete own favorites" on public.favorites;
create policy "delete own favorites"
  on public.favorites for delete to authenticated
  using (user_id = auth.uid());

-- No update policy: a favorite has nothing to change. You add it or you remove
-- it, and both are already covered.
