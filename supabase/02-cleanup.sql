-- Coffee Finder — step 2: make existing rows conform.
--
-- Runs BETWEEN 01-tables.sql and 03-constraints.sql, and the position is
-- load-bearing: the category CHECK in step 3 is validated against every row
-- present at that moment, so the old grocery/market/restaurant rows have to be
-- gone first.
--
-- Clears the old Vital Map health-food dataset and keeps Coffee Culture Coffee
-- Roasters — the one genuinely-coffee place, added by David through the editor.
-- Then re-homes it into the new schema: it arrives with empty claims (its old
-- sugarFree/organic assertions were about a grocery context and don't transfer),
-- so it lands honestly as "nobody has checked" rather than laundering a stale
-- claim into a new app.


-- Everything that isn't the coffee roaster.
delete from public.places
where id <> 'cur_coffee_culture_coffee_roasters';

-- Re-file it as a roastery and give it the full claim set, all unknown.
update public.places
set category = 'roastery',
    claims = jsonb_build_object(
      'roastsOnSite', '{"scope":"unknown","confidence":"unverified"}'::jsonb,
      'specialty',    '{"scope":"unknown","confidence":"unverified"}'::jsonb,
      'glutenFree',   '{"scope":"unknown","confidence":"unverified"}'::jsonb,
      'seedOilFree',  '{"scope":"unknown","confidence":"unverified"}'::jsonb
    ),
    flags = '{}'::text[]
where id = 'cur_coffee_culture_coffee_roasters';
