-- Avis Google — Étape 2 (Gilles 2026-06-23)
-- Suivi des CLICS + envois AUTOMATIQUES (hebdo / à la clôture de session).

-- 1. Horodatage du clic sur le bouton « Témoignez ICI » (via lien tracé).
alter table public.google_review_requests
  add column if not exists clicked_at timestamptz;

-- 2. Interrupteurs d'envoi automatique au niveau organisation
--    (désactivés par défaut : rien ne part sans activation explicite).
alter table public.organizations
  add column if not exists google_review_auto_weekly  boolean not null default false,
  add column if not exists google_review_auto_on_close boolean not null default false;
