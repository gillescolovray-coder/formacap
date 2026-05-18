-- =========================================================
-- Migration 0021 : Horaires par défaut matin/après-midi
-- au niveau de la session (appliqués aux session_days créés)
-- =========================================================

alter table public.sessions
  add column if not exists default_morning_start    time,
  add column if not exists default_morning_end      time,
  add column if not exists default_afternoon_start  time,
  add column if not exists default_afternoon_end    time;

comment on column public.sessions.default_morning_start is
  'Heure de debut matin par defaut, propagee aux session_days nouvellement crees.';
