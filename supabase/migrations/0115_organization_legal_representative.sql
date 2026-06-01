-- Migration 0115 : Nom du representant legal de l organisation
-- Date : 2026-06-01
-- Auteur : Gilles + Claude
--
-- OBJECTIF : afficher le nom + fonction du representant legal sur
-- les documents officiels (attestation de realisation, convention,
-- etc.). Phrase type : "Je soussigne(e), Gilles COLOVRAY, gerant
-- de CAP NUMERIQUE, atteste que..."

alter table public.organizations
  add column if not exists legal_representative_name text;

alter table public.organizations
  add column if not exists legal_representative_role text;

comment on column public.organizations.legal_representative_name is
  'Nom complet du representant legal de l organisme (ex: "Gilles COLOVRAY"). Insere automatiquement sur les attestations, conventions, etc. Migration 0115.';

comment on column public.organizations.legal_representative_role is
  'Fonction du representant legal (ex: "Gerant", "President", "Directeur"). Optionnel. Migration 0115.';
