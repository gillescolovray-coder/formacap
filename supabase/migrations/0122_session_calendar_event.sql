-- =========================================================
-- Migration 0122 : Synchro Google Agenda des sessions
-- =========================================================
-- Stocke l'identifiant de l'événement Google Agenda créé pour une
-- session, afin de pouvoir le mettre à jour ou le supprimer lors des
-- modifications / annulations (synchro temps réel via compte de service).
-- Voir src/lib/google-calendar/.
-- =========================================================

alter table public.sessions
  add column if not exists google_calendar_event_id text;

comment on column public.sessions.google_calendar_event_id is
  'ID de l''événement Google Agenda lié à cette session (synchro temps réel, migration 0122). NULL = pas encore synchronisé / non synchronisable.';
