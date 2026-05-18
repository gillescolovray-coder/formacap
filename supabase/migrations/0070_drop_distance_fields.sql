-- Annule les migrations 0068 (distance_modalities) et 0069
-- (distance_teaching_methods). Décision Gilles 2026-05-14 :
-- préférence pour UNE seule convention de formation valable pour toutes
-- les modalités (présentiel, distanciel, hybride), plus simple à gérer.
-- Les 2 champs FOAD conditionnels sont retirés du modèle.
--
-- DROP COLUMN IF EXISTS pour rester idempotent même si la migration 0068
-- ou 0069 n'avait pas été appliquée localement.

alter table public.formations
  drop column if exists distance_modalities,
  drop column if exists distance_teaching_methods;

alter table public.sessions
  drop column if exists distance_modalities,
  drop column if exists distance_teaching_methods;
