-- Traçabilité de la synchro agenda par session (Gilles 2026-06-25).
-- Permet d'afficher un avertissement pour les sessions NON synchronisées
-- (au lieu d'un échec silencieux).
alter table public.sessions
  add column if not exists calendar_synced_at  timestamptz,
  add column if not exists calendar_sync_error text;
