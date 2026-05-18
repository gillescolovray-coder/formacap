-- =========================================================
-- Migration 0089 : Tarif partenaire par jour différencié
--                  selon la modalité (distanciel / présentiel)
-- =========================================================
-- Le tarif jour d'un prescripteur diffère selon la modalité :
--   - Présentiel : coût plus élevé (déplacement formateur, salle, etc.)
--   - Distanciel : coût plus faible
--
-- On renomme l'ancienne colonne `partner_daily_rate_ht` en
-- `partner_daily_rate_distanciel_ht` (préservation des données) et
-- on ajoute une nouvelle colonne `partner_daily_rate_presentiel_ht`.
--
-- Le forfait OF (`partner_quiz_unit_price_ht`) reste inchangé : c'est
-- un forfait par apprenant pour l'accès aux quiz, indépendant de la
-- modalité de la formation.
-- =========================================================

alter table public.companies
  rename column partner_daily_rate_ht to partner_daily_rate_distanciel_ht;

alter table public.companies
  add column if not exists partner_daily_rate_presentiel_ht numeric(10,2)
    check (partner_daily_rate_presentiel_ht is null
           or partner_daily_rate_presentiel_ht >= 0);

comment on column public.companies.partner_daily_rate_distanciel_ht is
  'PRESCRIPTEUR : tarif HT par jour et par apprenant pour les formations DISTANCIEL. Appliqué automatiquement (× durée en jours) sauf override partner_pricing. Migration 0089 (ex partner_daily_rate_ht).';

comment on column public.companies.partner_daily_rate_presentiel_ht is
  'PRESCRIPTEUR : tarif HT par jour et par apprenant pour les formations PRÉSENTIEL. Coût généralement plus élevé que le distanciel (déplacement formateur, salle…). Migration 0089.';
