-- =========================================================
-- Migration 0110 : representant legal sur companies
-- =========================================================
-- Gilles 2026-05-28 : la convention de formation doit indiquer le
-- representant LEGAL de l'entreprise cliente (PDG, gerant, president,
-- directeur general...). C'est lui qui signe juridiquement la
-- convention — different du contact RH, du referent pedagogique ou
-- de l'apprenant.
--
-- Stockage : 4 colonnes dediees sur companies (pas dans
-- company_contacts car son role juridique est unique et separe).
--
-- Cas possible : le representant legal peut AUSSI etre un apprenant
-- de la formation (cas typique gerant TPE). Gere cote UI par un
-- bouton "Reprendre les infos d'un apprenant" qui prefill les
-- 4 champs. Pas de FK : evite couplage et autorise edition libre
-- (ex: fonction = "Gerant" meme si learner.job_title = "Comptable").
-- =========================================================

alter table public.companies
  add column if not exists representant_civility   text,
  add column if not exists representant_first_name text,
  add column if not exists representant_last_name  text,
  add column if not exists representant_job_title  text;

-- Contrainte light sur la civilite (cohérence avec learners.civility)
alter table public.companies
  drop constraint if exists companies_representant_civility_check;
alter table public.companies
  add constraint companies_representant_civility_check
    check (
      representant_civility is null
      or representant_civility in ('M.', 'Mme')
    );

comment on column public.companies.representant_civility is
  'Civilite du representant legal (M./Mme). Migration 0110.';
comment on column public.companies.representant_first_name is
  'Prenom du representant legal de l''entreprise. Migration 0110.';
comment on column public.companies.representant_last_name is
  'Nom du representant legal de l''entreprise. Migration 0110.';
comment on column public.companies.representant_job_title is
  'Fonction du representant legal (Gerant, PDG, President, DG...). Migration 0110.';
