-- =========================================================================
-- 0062 — Champ prospect_mobile sur inscription_requests
--
-- Décision Gilles 2026-05-14 : la fiche d'inscription doit afficher
-- DEUX champs téléphone distincts (fixe + mobile), à l'image de la
-- fiche apprenant (`learners.phone` + `learners.mobile`). Avant cette
-- migration, l'inscription n'avait qu'un seul champ `prospect_phone`
-- qui forçait à choisir entre fixe et portable.
--
-- Cette migration :
--   1. Ajoute la colonne `prospect_mobile` (text, null par défaut)
--   2. Backfill : copie `learners.mobile` → `prospect_mobile` pour
--      toutes les inscription_requests qui ont un learner lié et un
--      mobile sur la fiche apprenant.
-- =========================================================================

alter table public.inscription_requests
  add column if not exists prospect_mobile text;

comment on column public.inscription_requests.prospect_mobile is
  'Téléphone portable du prospect/apprenant (snapshot). Distinct de prospect_phone qui contient le fixe. Synchronisé depuis learners.mobile à la création de la demande (cf. lib/inscriptions/sync.ts). Migration 0062.';

-- Backfill : copie le mobile de la fiche apprenant pour les
-- inscriptions historiques qui n'ont pas encore ce snapshot.
update public.inscription_requests r
set prospect_mobile = l.mobile
from public.learners l
where r.learner_id = l.id
  and r.prospect_mobile is null
  and l.mobile is not null;
