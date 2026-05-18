-- =========================================================
-- Migration 0011 : durée en jours sur les formations
-- =========================================================
-- Ajoute une colonne explicite "duration_days" pour afficher et
-- éditer la durée d'une formation en jours (ex: 2 jours soit 14 heures).
-- =========================================================

alter table public.formations
  add column if not exists duration_days integer;

comment on column public.formations.duration_days is
  'Durée en nombre de journées (ex: 2 pour « 2 jours soit 14 heures »)';
