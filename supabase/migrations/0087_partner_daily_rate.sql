-- =========================================================
-- Migration 0087 : Tarifs partenaire (OF vs Prescripteur)
-- =========================================================
-- Deux modèles tarifaires distincts selon le type de partenaire :
--
--   Pour les PRESCRIPTEURS (CAP gère convocation, convention, attestation…) :
--     `partner_daily_rate_ht` = tarif HT par JOUR et par apprenant.
--     Prix effectif d'une formation = tarif_jour × durée_en_jours.
--
--   Pour les OF partenaires (CAP fournit UNIQUEMENT les quiz pré/post) :
--     `partner_quiz_unit_price_ht` = forfait HT par apprenant pour
--     l'accès aux quiz (indépendant de la durée de la formation).
--
-- Dans les deux cas, la table `partner_pricing` reste le mécanisme
-- d'override formation par formation.
--
-- Règle de calcul du prix effectif appliqué côté UI + action serveur :
--   1) Si ligne dans `partner_pricing` → utilise l'override.
--   2) Sinon, selon le type :
--        - prescripteur : daily_rate × duration_days
--        - of           : quiz_unit_price (forfait)
--   3) Sinon (ni override ni tarif général) → pas de tarif (Nous consulter).
-- =========================================================

alter table public.companies
  add column if not exists partner_daily_rate_ht numeric(10,2)
    check (partner_daily_rate_ht is null or partner_daily_rate_ht >= 0);

alter table public.companies
  add column if not exists partner_quiz_unit_price_ht numeric(10,2)
    check (partner_quiz_unit_price_ht is null or partner_quiz_unit_price_ht >= 0);

comment on column public.companies.partner_daily_rate_ht is
  'PRESCRIPTEUR : tarif HT général par jour et par apprenant. Appliqué à toutes les formations distanciel INTER sauf override partner_pricing. Migration 0087.';

comment on column public.companies.partner_quiz_unit_price_ht is
  'OF PARTENAIRE : forfait HT par apprenant pour l''accès aux quiz pré/post (CAP NUMERIQUE ne génère pas les documents administratifs, c''est l''OF qui s''en charge). Migration 0087.';
