-- =========================================================
-- Migration 0111 : archivage Google Drive des sessions
-- =========================================================
-- Gilles 2026-05-28 : pour chaque session en cours ou terminee,
-- creer un dossier dedie sur le Google Drive Workspace de cap
-- numerique avec une codification stricte :
--   [YYYY-MM-DD - Nj] - [INTER ou INTRA] - [Prescripteur/OF/cap numerique] - [Nom session]
--
-- 3 nouvelles colonnes pour tracer l'archivage :
--   - drive_folder_id : id Google Drive du dossier de la session
--   - drive_archived_at : date du dernier archivage / sync
--   - drive_archived_by : profile_id de l'utilisateur ayant
--     declenche l'archivage (audit Qualiopi)
-- =========================================================

alter table public.sessions
  add column if not exists drive_folder_id   text,
  add column if not exists drive_archived_at timestamptz,
  add column if not exists drive_archived_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_sessions_drive_folder_id
  on public.sessions(drive_folder_id)
  where drive_folder_id is not null;

comment on column public.sessions.drive_folder_id is
  'ID Google Drive du dossier dedie a cette session (cree par l''integration Drive). Migration 0111.';
comment on column public.sessions.drive_archived_at is
  'Date du dernier archivage / sync Drive. Migration 0111.';
comment on column public.sessions.drive_archived_by is
  'Membre OF qui a declenche l''archivage. Migration 0111.';
