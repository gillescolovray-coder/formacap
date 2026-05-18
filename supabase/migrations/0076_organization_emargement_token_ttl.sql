-- =========================================================
-- Migration 0076 : Durée de validité du token QR émargement
-- =========================================================
-- Ajoute un paramètre organisation : combien de jours le QR code
-- d''émargement reste valable APRÈS la fin de la session.
--
-- Défaut = 7 jours : laisse une semaine de tolérance pour
-- rattraper un oubli/problème réseau. Au-delà, l''OF doit
-- régénérer un nouveau QR sous son contrôle (évite
-- les signatures a posteriori non contrôlées).
-- =========================================================

alter table public.organizations
  add column if not exists emargement_token_ttl_days integer not null default 7
    check (emargement_token_ttl_days between 0 and 90);

comment on column public.organizations.emargement_token_ttl_days is
  'Nombre de jours après la fin de session pendant lesquels le QR code d''émargement reste valable. Défaut 7. Min 0 (expire le jour même), max 90.';
