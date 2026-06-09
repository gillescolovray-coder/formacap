-- =========================================================
-- Migration 0126 : Contenu rédactionnel complet du brouillon programme
-- =========================================================
-- Le module Programmes doit produire un programme COMPLET (rédigé par l'IA,
-- éditable en contenu + mise en forme). On stocke donc directement sur le
-- brouillon les champs riches (HTML) + le déroulé pédagogique. Ils sont
-- recopiés vers la fiche formation à la bascule au catalogue.
-- =========================================================

alter table public.program_blueprints
  add column if not exists prerequisites      text,  -- HTML riche
  add column if not exists evaluation_methods text,  -- HTML riche
  add column if not exists teaching_methods   text,  -- HTML riche
  -- Déroulé pédagogique : tableau JSON [{ morning, afternoon }] (HTML riche),
  -- même structure que formations.programme_days.
  add column if not exists programme_days     jsonb default '[]'::jsonb;

comment on column public.program_blueprints.programme_days is
  'Déroulé pédagogique [{morning,afternoon}] (HTML riche). Recopié vers formations.programme_days à la bascule. Migration 0126.';
