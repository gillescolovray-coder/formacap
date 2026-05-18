-- =========================================================
-- Migration 0045 : Mentions légales de l'organisation
-- =========================================================
-- Stocke un texte libre multi-lignes (raison sociale, SIRET,
-- NDA, adresse, téléphone, email...) qui sera repris en pied
-- de page de tous les documents imprimables (feuilles
-- d'émargement, conventions, attestations...).

alter table public.organizations
  add column if not exists legal_mentions text;

comment on column public.organizations.legal_mentions is
  'Mentions legales de l''organisation (texte libre multi-lignes), reprises en pied de page des documents imprimables.';
