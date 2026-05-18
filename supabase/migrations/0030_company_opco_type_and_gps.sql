-- =========================================================
-- Migration 0030 : type "OPCO" + coordonnées GPS sur companies
-- =========================================================
-- Objectif :
--   1) Ajouter la valeur "opco" à l'enum company_type pour permettre
--      de qualifier une entreprise comme un OPCO.
--   2) Ajouter latitude/longitude/gps_source/gps_updated_at sur
--      la table companies (mêmes champs que formation_locations).
-- =========================================================

-- 1. Nouvelle valeur de l'enum company_type
do $$ begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'company_type' and e.enumlabel = 'opco'
  ) then
    alter type public.company_type add value 'opco';
  end if;
end $$;

-- 2. Coordonnées GPS sur companies
alter table public.companies
  add column if not exists latitude       numeric(9,6),
  add column if not exists longitude      numeric(9,6),
  add column if not exists gps_source     text
    check (gps_source in ('auto','manual')),
  add column if not exists gps_updated_at timestamptz;

comment on column public.companies.gps_source is
  'auto = geocode automatique depuis l''adresse, manual = saisi par l''utilisateur';
comment on column public.companies.gps_updated_at is
  'Date de dernière mise à jour du point GPS (création ou modification).';
