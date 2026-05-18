-- =========================================================
-- Migration 0027 : champs SIRENE / Pappers sur companies
-- =========================================================
-- Objectif : permettre l'auto-remplissage depuis l'API
-- recherche-entreprises.api.gouv.fr (INSEE Sirene) et la
-- consultation directe de la fiche Pappers.
-- =========================================================

alter table public.companies
  add column if not exists siren        text,
  add column if not exists naf_code     text,
  add column if not exists legal_status text,   -- 'A' = active, 'C' = cessée, 'D' = en dissolution / autre
  add column if not exists pappers_url  text;

comment on column public.companies.siren is
  'Numéro SIREN (9 chiffres). Permet de générer l''URL Pappers et d''interroger l''INSEE.';
comment on column public.companies.naf_code is
  'Code NAF / APE (ex : 6201Z) — issu de l''API recherche-entreprises.api.gouv.fr.';
comment on column public.companies.legal_status is
  'État administratif : A (active), C (cessée), D (autre — dissolution, redressement, liquidation).';
comment on column public.companies.pappers_url is
  'Lien direct vers la fiche Pappers (https://www.pappers.fr/entreprise/<siren>).';

create index if not exists idx_companies_siren on public.companies(siren);
