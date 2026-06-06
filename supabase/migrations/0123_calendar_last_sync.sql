-- =========================================================
-- Migration 0123 : Date de dernière synchronisation Google Agenda
-- =========================================================
-- Mémorise la dernière fois que le bouton "Synchroniser l'agenda" a poussé
-- l'ensemble des sessions vers Google Agenda (affiché à côté du bouton).
-- =========================================================

alter table public.organizations
  add column if not exists calendar_last_sync_at timestamptz;

comment on column public.organizations.calendar_last_sync_at is
  'Horodatage de la dernière synchronisation complète des sessions vers Google Agenda (bouton "Synchroniser l''agenda"). Migration 0123.';
