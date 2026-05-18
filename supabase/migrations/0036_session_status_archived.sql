-- =========================================================================
-- 0036 — Statut « Archivée » pour les sessions
--
-- Permet à l'utilisateur de masquer manuellement une session du tableau
-- d'inscriptions et de la liste principale, tout en conservant la fiche
-- accessible directement par son URL pour rééditer un document
-- (convention, attestation, certificat…) ultérieurement.
-- =========================================================================

alter type public.session_status add value if not exists 'archived';
