-- ============================================================
-- Tarifs partenaires par défaut au niveau organisation
-- Gilles 2026-05-22 (Option A — tarif par défaut OF/Prescripteur)
--
-- Permet de définir un tarif par défaut applicable à TOUS les
-- partenaires d'un type donné (OF ou prescripteur) qui n'ont pas
-- de tarif spécifique (override) renseigné sur leur fiche entreprise.
--
-- Cascade utilisée par computeEffectivePartnerPrice :
--   1. Override sur partner_pricing (formation × company spécifique)
--   2. daily_rate sur companies (override par société)
--   3. NOUVEAU : default rate sur organization_pricing_defaults (par type)
--   4. quiz_unit_price legacy
--
-- Avantage : pas besoin de saisir manuellement le tarif sur chaque
-- nouvelle société partenaire, le défaut s'applique automatiquement.
-- ============================================================

alter table public.organization_pricing_defaults
  add column if not exists partner_of_distanciel_per_day_ht numeric,
  add column if not exists partner_of_presentiel_per_day_ht numeric,
  add column if not exists partner_prescripteur_distanciel_per_day_ht numeric,
  add column if not exists partner_prescripteur_presentiel_per_day_ht numeric;

comment on column public.organization_pricing_defaults.partner_of_distanciel_per_day_ht is
  'Tarif HT par jour appliqué par défaut aux OF partenaires (distanciel) sans override.';
comment on column public.organization_pricing_defaults.partner_of_presentiel_per_day_ht is
  'Tarif HT par jour appliqué par défaut aux OF partenaires (présentiel) sans override.';
comment on column public.organization_pricing_defaults.partner_prescripteur_distanciel_per_day_ht is
  'Tarif HT par jour appliqué par défaut aux prescripteurs (distanciel) sans override.';
comment on column public.organization_pricing_defaults.partner_prescripteur_presentiel_per_day_ht is
  'Tarif HT par jour appliqué par défaut aux prescripteurs (présentiel) sans override.';
