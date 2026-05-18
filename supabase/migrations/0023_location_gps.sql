-- =========================================================
-- Migration 0023 : Coordonnees GPS des lieux de formation
-- =========================================================

alter table public.formation_locations
  add column if not exists latitude       numeric(9,6),
  add column if not exists longitude      numeric(9,6),
  add column if not exists gps_source     text
    check (gps_source in ('auto','manual')),
  add column if not exists gps_updated_at timestamptz;

comment on column public.formation_locations.gps_source is
  'auto = geocode automatique depuis l''adresse, manual = saisi par l''utilisateur';
comment on column public.formation_locations.gps_updated_at is
  'Date de derniere mise a jour du point GPS (creation ou modification).';
