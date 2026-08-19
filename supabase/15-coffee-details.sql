-- Structured coffee programs and bar setup, shared by public listings and
-- owner submissions. Arrays stay empty for older rows; the app infers their
-- program from existing menu data until the team reviews them.

alter table public.places
  add column if not exists drink_styles text[] not null default '{}',
  add column if not exists coffee_brand text,
  add column if not exists espresso_machine_brand text,
  add column if not exists espresso_grinder_brand text,
  add column if not exists filter_grinder_brand text,
  add column if not exists filter_methods text[] not null default '{}';

alter table public.submissions
  add column if not exists drink_styles text[] not null default '{}',
  add column if not exists espresso_machine_brand text,
  add column if not exists espresso_grinder_brand text,
  add column if not exists filter_grinder_brand text,
  add column if not exists filter_methods text[] not null default '{}';
