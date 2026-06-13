-- 0128 — Abandon du statut « Archivée » au profit de « Dossier clôturé »
-- (Gilles 2026-06-13).
--
-- Le statut « archived » retirait la session du CA / des tableaux de bord.
-- On le remplace par le marqueur admin_closed_at (qui CONSERVE le CA et
-- verrouille la session). On convertit donc l'historique :
--   archived -> status = 'completed' + admin_closed_at renseigné.
--
-- Idempotent : ne touche que les sessions encore au statut 'archived'.

UPDATE sessions
SET
  status = 'completed',
  admin_closed_at = COALESCE(admin_closed_at, now())
WHERE status = 'archived';
