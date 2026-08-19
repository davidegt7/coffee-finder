-- Bean-program detail for public filtering and the shared owner/team forms.
-- Sourcing is stored only for roasteries by the app and remains explicitly a
-- declared business claim rather than an independently verified fact.

alter table public.places
  add column if not exists roast_levels text[] not null default '{}',
  add column if not exists cupping_score_min numeric(5,2),
  add column if not exists cupping_score_max numeric(5,2),
  add column if not exists sourcing_model text;

alter table public.submissions
  add column if not exists roast_levels text[] not null default '{}',
  add column if not exists cupping_score_min numeric(5,2),
  add column if not exists cupping_score_max numeric(5,2),
  add column if not exists sourcing_model text;
