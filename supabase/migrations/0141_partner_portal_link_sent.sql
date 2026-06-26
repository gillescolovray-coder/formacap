-- Traçabilité de l'envoi par email du lien d'accès au portail partenaire
-- (Gilles 2026-06-26). On garde le DERNIER envoi (date/heure + destinataire).
alter table public.companies
  add column if not exists partner_portal_link_sent_at timestamptz,
  add column if not exists partner_portal_link_sent_to text;
