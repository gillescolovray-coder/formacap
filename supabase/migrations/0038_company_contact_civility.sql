-- =========================================================================
-- 0038 — Civilité sur les contacts d'entreprise
--
-- Ajoute la colonne `civility` à la table `company_contacts` pour
-- aligner la fiche contact avec la fiche apprenant (qui a déjà ce
-- champ). Valeurs autorisées côté UI : « M. », « Mme », « Autre ».
-- =========================================================================

alter table public.company_contacts
  add column if not exists civility text;

comment on column public.company_contacts.civility is
  'Civilité du contact (M. / Mme / Autre). Aligné avec learners.civility.';
