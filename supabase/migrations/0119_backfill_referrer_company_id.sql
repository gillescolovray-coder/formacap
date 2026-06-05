-- =========================================================
-- Migration 0119 : Backfill referrer_company_id (visibilité portail
-- prescripteur / OF)
-- =========================================================
-- Le portail d'un partenaire (OF / prescripteur) liste SES inscriptions
-- en filtrant sur inscription_requests.referrer_company_id. Or, quand
-- CAP saisit une inscription POUR un prescripteur/OF, seul le champ
-- inscription_channel_company_id était rempli (la "source"), pas
-- referrer_company_id -> l'inscription n'apparaissait pas sur le portail
-- du partenaire (bug Gilles 2026-06-05).
--
-- Pour un canal 'of' ou 'prescripteur', le "référent" EST la société du
-- canal. On aligne donc referrer_company_id sur inscription_channel_company_id
-- pour les inscriptions existantes où il manque.
-- (Le code applicatif synchronise désormais les deux champs à la saisie.)
-- =========================================================

update public.inscription_requests
set referrer_company_id = inscription_channel_company_id
where inscription_channel in ('of', 'prescripteur')
  and inscription_channel_company_id is not null
  and referrer_company_id is null;
