-- 0129 — Traçabilité de la convocation FORMATEUR (Gilles 2026-06-16).
--
-- Avant : la fiche session déduisait l'état « convocation envoyée » du
-- simple statut (confirmed) → impression trompeuse (le bouton affichait
-- « Renvoyer » alors qu'aucun email n'était parti, notamment quand la
-- session était confirmée depuis le tableau via le menu statut rapide qui
-- n'envoyait rien). On trace désormais l'envoi RÉEL.
--
-- - trainer_convocation_sent_at : date/heure du dernier envoi réussi (null si jamais).
-- - trainer_convocation_to      : email réellement destinataire du dernier envoi.
-- - trainer_convocation_error   : dernière erreur d'envoi (null si OK), pour
--                                 afficher la raison côté fiche.

alter table sessions
  add column if not exists trainer_convocation_sent_at timestamptz,
  add column if not exists trainer_convocation_to text,
  add column if not exists trainer_convocation_error text;
