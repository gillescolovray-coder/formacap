-- =========================================================
-- Migration 0015 : Adresse et contact entreprise du formateur
-- =========================================================
-- Permet de distinguer l'adresse personnelle du formateur
-- de l'adresse de son entreprise (utile pour les externes).
-- =========================================================

alter table public.trainers
  add column if not exists company_address      text,
  add column if not exists company_postal_code  text,
  add column if not exists company_city         text,
  add column if not exists company_country      text default 'France',
  add column if not exists company_phone        text,
  add column if not exists company_email        text,
  add column if not exists company_address_same boolean default false;

comment on column public.trainers.company_address_same is
  'Si true, l''adresse entreprise est identique à l''adresse personnelle.';
