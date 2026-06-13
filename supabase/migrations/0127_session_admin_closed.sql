-- 0127 — Clôture administrative d'une session (Gilles 2026-06-13)
--
-- Marqueur INDÉPENDANT du statut : permet d'indiquer que le post-formation
-- (émargement, attestations, archivage…) a été géré administrativement et
-- que le dossier est "clôturé", SANS changer le statut (Confirmée/Terminée…)
-- ni impacter le CA / les tableaux de bord (qui se basent sur `status`).
--
-- Servira aussi de déclencheur "prêt à facturer" pour la future intégration
-- de facturation (Dolibarr, hybride FORMACAP -> Dolibarr).

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS admin_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_closed_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN sessions.admin_closed_at IS
  'Date/heure de clôture administrative (dossier post-formation traité). NULL = non clôturé. Indépendant de status, sans impact sur le CA.';
COMMENT ON COLUMN sessions.admin_closed_by IS
  'Utilisateur ayant clôturé administrativement le dossier de la session.';
