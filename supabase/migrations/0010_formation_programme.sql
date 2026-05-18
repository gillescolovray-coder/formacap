-- =========================================================
-- Migration 0010 : programme détaillé structuré + champs
-- complémentaires sur les fiches formation
-- =========================================================
-- Objectif : aligner la fiche formation sur le format Qualiopi
-- (programme par journée × demi-journée, effectif recommandé,
-- pédagogie distincte des méthodes pédagogiques, tarif libre).
-- =========================================================

-- Programme structuré : tableau de journées avec morning/afternoon
alter table public.formations
  add column if not exists programme_days jsonb not null default '[]'::jsonb;

-- Effectif recommandé (défauts appliqués aux sessions créées depuis cette formation)
alter table public.formations
  add column if not exists min_participants integer;

alter table public.formations
  add column if not exists max_participants integer;

-- Texte libre de tarification (ex: « Sur devis », « À partir de 1200€ »)
alter table public.formations
  add column if not exists pricing_note text;

-- Approche pédagogique (différente des méthodes pédagogiques)
alter table public.formations
  add column if not exists pedagogy_approach text;

comment on column public.formations.programme_days is
  'Tableau JSON : [{ "morning": "...", "afternoon": "..." }, ...] — une entrée par jour';
comment on column public.formations.pedagogy_approach is
  'Approche pédagogique générale (animation, échanges, philosophie) — distincte des méthodes pédagogiques concrètes';
comment on column public.formations.pricing_note is
  'Texte libre de tarif : "Sur devis", "À partir de X€", ou complément au prix HT';
