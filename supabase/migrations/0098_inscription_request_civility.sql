-- ============================================================
-- Migration 0098 : civilité prospect sur inscription_requests
-- Gilles 2026-05-22
--
-- Permet aux formulaires de pré-inscription publique et portail
-- partenaire de capturer la civilité de l'apprenant (M. / Mme) au
-- moment de la demande. Cette valeur est ensuite reportée sur le
-- learner créé à la validation.
-- ============================================================

alter table public.inscription_requests
  add column if not exists prospect_civility text;

comment on column public.inscription_requests.prospect_civility is
  'Civilité de l''apprenant (M. / Mme). Reportée sur learners.civility a la creation.';
