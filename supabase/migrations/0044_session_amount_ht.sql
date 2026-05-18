-- =========================================================
-- Migration 0044 : Montant HT global d'une session
-- =========================================================
-- Champ saisi manuellement sur la fiche session pour suivre
-- le montant facture (independamment des inscriptions OPCO).
-- Permet d'afficher dans la liste sessions le total par statut.

alter table public.sessions
  add column if not exists amount_ht numeric(12, 2);

comment on column public.sessions.amount_ht is
  'Montant HT global de la session, en euros (saisie manuelle, independant des inscriptions OPCO).';
