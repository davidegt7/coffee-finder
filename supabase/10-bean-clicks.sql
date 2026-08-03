-- Coffee Finder — outbound clicks to roasters who sell beans.
--
-- Run after the main setup. Idempotent.
--
-- WHY THIS EXISTS: we send people to a roaster's own shop and then go blind —
-- nothing on our side can see whether they bought. This table records the one
-- thing we CAN honestly measure: how many people we sent. That number is what
-- lets us later tell a roaster "we sent you 400 people last month", which is
-- the only defensible basis for charging for placement. Adding it later would
-- mean throwing away the months of history that make the case.
--
-- WHAT IT DELIBERATELY DOES NOT STORE: no user id, no session, no IP, no
-- per-click row. A tally and two timestamps. We do not need to know who wants
-- coffee beans, so we make it impossible to ask — the same reason favorites
-- are locked to their owner rather than merely hidden in the UI.
--
-- KNOWN LIMIT, stated here so nobody discovers it in a negotiation: the
-- increment is callable by anyone, so the tally is inflatable by someone
-- determined. It is honest telemetry, not an audited number. If it ever backs
-- an invoice, agree the figure against the roaster's own analytics (tag the
-- outbound links with utm_source) rather than treating this as proof.

create table if not exists public.bean_clicks (
  place_id       text primary key references public.places(id) on delete cascade,
  clicks         bigint not null default 0,
  first_click_at timestamptz not null default now(),
  last_click_at  timestamptz not null default now()
);

alter table public.bean_clicks enable row level security;

-- Counts are commercial leverage, not public content. Visitors increment them
-- through the function below but cannot read them; the places themselves stay
-- public as they always were.
drop policy if exists "editors read bean clicks" on public.bean_clicks;
create policy "editors read bean clicks"
  on public.bean_clicks for select to authenticated
  using (public.is_editor());

-- No insert/update/delete policy on purpose. Every write goes through
-- record_bean_click(), which is the only way to touch this table and can only
-- ever add one. A plain update policy would let a caller PUT any number it
-- liked into the column, which is a worse problem than not counting at all.

create or replace function public.record_bean_click(p_place_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Unknown ids are ignored rather than erroring: the caller is a link click,
  -- and a stale place id should never surface as a failure to the person who
  -- just wanted to buy coffee. The foreign key would reject it anyway.
  if not exists (select 1 from public.places where id = p_place_id) then
    return;
  end if;

  insert into public.bean_clicks as bc (place_id, clicks)
  values (p_place_id, 1)
  on conflict (place_id) do update
    set clicks = bc.clicks + 1,
        last_click_at = now();
end;
$$;

revoke all on function public.record_bean_click(text) from public;
grant execute on function public.record_bean_click(text) to anon, authenticated;

comment on function public.record_bean_click(text) is
  'Adds exactly one click for a place. The only write path into bean_clicks, so a caller cannot set the tally to an arbitrary value.';
