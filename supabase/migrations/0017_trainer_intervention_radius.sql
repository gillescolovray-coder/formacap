-- =========================================================
-- Migration 0017 : Rayon d'intervention en présentiel
-- =========================================================

alter table public.trainers
  add column if not exists intervention_radius_km int;

comment on column public.trainers.intervention_radius_km is
  'Rayon en km autour de la ville du formateur pour ses prestations en presentiel.';
