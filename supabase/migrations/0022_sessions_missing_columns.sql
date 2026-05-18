-- =========================================================
-- Migration 0022 : Colonnes manquantes sur sessions (Qualiopi)
-- =========================================================

-- Type enum : nature de l'action de formation
do $$ begin
  create type public.session_action_type as enum (
    'action_formation',
    'bilan_competences',
    'vae',
    'apprentissage'
  );
exception when duplicate_object then null; end $$;

-- Colonnes manquantes
alter table public.sessions
  add column if not exists internal_code         text,
  add column if not exists action_type           public.session_action_type
    not null default 'action_formation',
  add column if not exists nsf_specialty         text,
  add column if not exists target_diploma        text,
  add column if not exists target_certification  text,
  add column if not exists is_inter              boolean not null default true,
  add column if not exists is_subcontracted      boolean not null default false,
  add column if not exists subcontractor_name    text;

comment on column public.sessions.action_type is
  'Type d''action de formation au sens du Code du travail (Qualiopi).';
comment on column public.sessions.nsf_specialty is
  'Code NSF (3 chiffres) de la specialite de formation.';
comment on column public.sessions.is_inter is
  'true = session inter-entreprises, false = intra-entreprise.';
