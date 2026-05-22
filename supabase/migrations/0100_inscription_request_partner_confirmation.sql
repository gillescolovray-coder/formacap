-- ============================================================
-- Migration 0100 : tracking envoi confirmation Gmail aux apprenants OF
-- Gilles 2026-05-22
--
-- Bouton "Confirmer via Gmail" affiche sur la page Convocations
-- (et Conventions) pour les apprenants inscrits via un OF partenaire :
-- ouvre Gmail compose avec un email de confirmation d'inscription.
--
-- Cette migration ajoute le tracking en BDD du clic sur ce bouton, pour :
--   - Afficher un badge "Confirme·e" sur la ligne
--   - Eviter les doubles envois
--   - Tracabilite Qualiopi (date d'envoi du mail)
-- ============================================================

alter table public.inscription_requests
  add column if not exists partner_confirmation_email_sent_at timestamptz;

comment on column public.inscription_requests.partner_confirmation_email_sent_at is
  'Date d''envoi (clic sur le bouton Gmail compose) de l''email de confirmation d''inscription a l''apprenant OF par CAP NUMERIQUE.';
