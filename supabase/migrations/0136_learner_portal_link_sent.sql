-- Trace d'envoi du lien portail apprenant (Gilles 2026-06-25).
-- Permet d'afficher « lien envoyé le … » et de gérer l'envoi groupé.
alter table public.learners
  add column if not exists portal_link_sent_at    timestamptz,
  add column if not exists portal_link_sent_count integer not null default 0;
