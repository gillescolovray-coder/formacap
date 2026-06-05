-- =========================================================
-- Migration 0120 : Lien Google Drive des supports de formation
-- =========================================================
-- Pour les supports volumineux (> 50 Mo) ou simplement partagés via
-- Drive, on stocke un lien Drive :
--   • sur la FORMATION (catalogue) = valeur par défaut du programme ;
--   • sur la SESSION = override éventuel (NULL => hérite de la formation).
--
-- Côté apprenant, l'accès aux supports (fichiers ET lien Drive) est
-- réservé aux apprenants ayant émargé (cf. logique applicative).
-- =========================================================

alter table public.formations
  add column if not exists support_drive_url text;

comment on column public.formations.support_drive_url is
  'Lien Google Drive (ou autre) des supports de formation, hérité par les sessions. Migration 0120.';

alter table public.sessions
  add column if not exists support_drive_url text;

comment on column public.sessions.support_drive_url is
  'Override du lien Drive des supports pour cette session (NULL = hérite de formations.support_drive_url). Migration 0120.';
