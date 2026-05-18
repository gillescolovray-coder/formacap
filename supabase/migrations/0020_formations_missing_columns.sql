-- =========================================================
-- Migration 0020 : Colonnes manquantes sur la table formations
-- =========================================================
-- Le code utilise plusieurs colonnes qui n'ont jamais eu de migration :
-- métadonnées commerciales (Lot 1), Qualiopi avancé (Lot 2), comptabilité (Lot 3).
-- =========================================================

-- Lot 1 : Métadonnées commerciales
alter table public.formations
  add column if not exists subtitle             text,
  add column if not exists cover_image_url      text,
  add column if not exists version_date         date,
  add column if not exists price_company        numeric(10,2),
  add column if not exists price_individual     numeric(10,2),
  add column if not exists price_independent    numeric(10,2),
  add column if not exists is_cpf_eligible      boolean not null default false,
  add column if not exists is_published_online  boolean not null default false;

-- Lot 2 : Qualiopi avancé
alter table public.formations
  add column if not exists execution_followup   text,
  add column if not exists certification_terms  text,
  add column if not exists quality_indicators   text,
  add column if not exists competence_domains   text[] not null default '{}';

-- Lot 3 : Comptabilité
alter table public.formations
  add column if not exists accounting_product_code  text,
  add column if not exists accounting_analytic_code text;

comment on column public.formations.subtitle is
  'Sous-titre commercial (ex: "Devenir expert en réponse aux marchés publics avec l''IA")';
comment on column public.formations.cover_image_url is
  'URL de l''image de couverture (16:9 idéal)';
comment on column public.formations.version_date is
  'Date de mise à jour de la fiche formation (preuve Qualiopi)';
comment on column public.formations.is_cpf_eligible is
  'Formation éligible au Compte Personnel de Formation';
comment on column public.formations.is_published_online is
  'Formation visible sur le site public ou catalogue en ligne';
comment on column public.formations.execution_followup is
  'Modalités de suivi de l''exécution (Qualiopi)';
comment on column public.formations.certification_terms is
  'Modalités de certification visée';
comment on column public.formations.quality_indicators is
  'Indicateurs de résultats / qualité';
comment on column public.formations.competence_domains is
  'Domaines de compétences couverts (tableau de strings)';
comment on column public.formations.accounting_product_code is
  'Code produit en comptabilité (utile pour la facturation)';
comment on column public.formations.accounting_analytic_code is
  'Code analytique pour répartition de revenus';
