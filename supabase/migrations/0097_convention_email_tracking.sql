-- ============================================================
-- Migration 0097 : tracking pré-notification + cycle de vie email
-- Gilles 2026-05-22
--
-- Permet de tracer pour chaque convention envoyée :
--   - prenotified_at : l'admin a envoyé l'email de pré-notification
--                       depuis sa boîte Gmail perso (bouton Gmail compose)
--   - delivered_at   : Resend confirme la livraison côté serveur destinataire
--   - opened_at      : pixel tracking — email ouvert dans le client mail
--   - clicked_at     : lien de signature cliqué dans l'email
--   - bounced_at     : rejeté définitivement (adresse invalide / serveur DOWN)
--   - complained_at  : marqué comme spam par le destinataire
--
-- Ces champs sont alimentés par les webhooks Resend
-- (`/api/webhooks/resend`). On garde aussi la date de signature
-- (`signed_at`) qui existe déjà, c'est l'évènement final.
-- ============================================================

alter table public.session_conventions
  add column if not exists prenotified_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz,
  -- ID du message Resend, retourné à l'envoi. Sert à matcher
  -- les webhooks entrants avec la bonne convention.
  add column if not exists resend_email_id text;

create index if not exists idx_session_conventions_resend_email_id
  on public.session_conventions(resend_email_id)
  where resend_email_id is not null;

comment on column public.session_conventions.prenotified_at is
  'Date d''envoi du mail de pre-notification (Gmail compose, action manuelle de l''admin).';
comment on column public.session_conventions.delivered_at is
  'Webhook Resend email.delivered : email accepte par le serveur destinataire.';
comment on column public.session_conventions.opened_at is
  'Webhook Resend email.opened : pixel tracking (premiere ouverture).';
comment on column public.session_conventions.clicked_at is
  'Webhook Resend email.clicked : lien de signature clique (premier clic).';
comment on column public.session_conventions.bounced_at is
  'Webhook Resend email.bounced : email rejete (mauvaise adresse, etc.).';
comment on column public.session_conventions.complained_at is
  'Webhook Resend email.complained : destinataire marque comme spam.';
comment on column public.session_conventions.resend_email_id is
  'ID Resend du message envoye (cle pour matcher les webhooks entrants).';
