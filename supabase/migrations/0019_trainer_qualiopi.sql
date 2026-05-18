-- =========================================================
-- Migration 0019 : Conformité Qualiopi de l'entreprise
-- du formateur (lorsqu'elle est elle-même OF)
-- =========================================================

alter table public.trainers
  add column if not exists is_qualiopi         boolean not null default false,
  add column if not exists qualiopi_expires_on date;

comment on column public.trainers.is_qualiopi is
  'Indique si l''entreprise du formateur est elle-meme certifiee Qualiopi.';
comment on column public.trainers.qualiopi_expires_on is
  'Date de fin de validite du certificat Qualiopi.';
