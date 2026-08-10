-- Coffee Finder — photo-permission outreach and roaster referral telemetry.
--
-- Run after 01..10. Idempotent.
--
-- This migration keeps two deliberately different kinds of data:
--   1. private editorial workflow for permission to use café photos;
--   2. anonymous daily click totals for traffic sent to roasters.
--
-- Referral rows contain no user, session, IP, or browser identifier. UTM tags
-- on the outgoing URL let a roaster compare our tally with their own analytics.

-- ---------------------------------------------------------------- outreach

create table if not exists public.photo_permissions (
  place_id           text primary key references public.places(id) on delete cascade,
  contact_name       text,
  contact_email      text,
  status             text not null default 'not_contacted' check (status in (
                       'not_contacted', 'sent', 'follow_up',
                       'approved', 'declined', 'no_response'
                     )),
  photo_urls         text[] not null default '{}',
  permission_scope   text not null default 'specific' check (permission_scope in (
                       'specific', 'general'
                     )),
  evidence           text,
  notes              text,
  last_contacted_at  timestamptz,
  follow_up_due_at   date,
  responded_at       timestamptz,
  updated_at         timestamptz not null default now(),
  updated_by         text not null default coalesce(auth.jwt() ->> 'email', '')
);

create index if not exists photo_permissions_status_due_idx
  on public.photo_permissions (status, follow_up_due_at, updated_at desc);

alter table public.photo_permissions enable row level security;

drop policy if exists "only editors read photo permissions" on public.photo_permissions;
create policy "only editors read photo permissions"
  on public.photo_permissions for select to authenticated
  using (public.is_editor());

drop policy if exists "only editors insert photo permissions" on public.photo_permissions;
create policy "only editors insert photo permissions"
  on public.photo_permissions for insert to authenticated
  with check (public.is_editor());

drop policy if exists "only editors update photo permissions" on public.photo_permissions;
create policy "only editors update photo permissions"
  on public.photo_permissions for update to authenticated
  using (public.is_editor()) with check (public.is_editor());

drop policy if exists "only editors delete photo permissions" on public.photo_permissions;
create policy "only editors delete photo permissions"
  on public.photo_permissions for delete to authenticated
  using (public.is_editor());

create or replace function public.touch_photo_permission()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by, '');
  return new;
end;
$$;

drop trigger if exists photo_permissions_touch on public.photo_permissions;
create trigger photo_permissions_touch
  before insert or update on public.photo_permissions
  for each row execute function public.touch_photo_permission();

comment on table public.photo_permissions is
  'Private editor workflow and evidence for permission to use café photos.';

-- ------------------------------------------------------------- referrals

create table if not exists public.roaster_referral_daily (
  roaster_id      text not null,
  channel         text not null check (channel in ('shop', 'website')),
  clicked_on      date not null default current_date,
  clicks          bigint not null default 0 check (clicks >= 0),
  first_click_at  timestamptz not null default now(),
  last_click_at   timestamptz not null default now(),
  primary key (roaster_id, channel, clicked_on)
);

create index if not exists roaster_referral_recent_idx
  on public.roaster_referral_daily (clicked_on desc, roaster_id);

alter table public.roaster_referral_daily enable row level security;

drop policy if exists "editors read roaster referrals" on public.roaster_referral_daily;
create policy "editors read roaster referrals"
  on public.roaster_referral_daily for select to authenticated
  using (public.is_editor());

-- No direct insert/update policy: the public function can only add one to a
-- valid aggregate key. The table itself remains unreadable to visitors.
create or replace function public.record_roaster_referral(
  p_roaster_id text,
  p_channel text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_roaster_id !~ '^rst_[a-z0-9_]{1,80}$'
     or p_channel not in ('shop', 'website') then
    return;
  end if;

  insert into public.roaster_referral_daily as rr (
    roaster_id, channel, clicked_on, clicks
  ) values (
    p_roaster_id, p_channel, current_date, 1
  )
  on conflict (roaster_id, channel, clicked_on) do update
    set clicks = rr.clicks + 1,
        last_click_at = now();
end;
$$;

revoke all on function public.record_roaster_referral(text, text) from public;
grant execute on function public.record_roaster_referral(text, text) to anon, authenticated;

comment on function public.record_roaster_referral(text, text) is
  'Adds one anonymous outbound click to a daily roaster/channel aggregate.';
