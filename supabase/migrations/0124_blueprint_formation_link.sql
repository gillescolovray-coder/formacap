-- =========================================================
-- Migration 0124 : Lien programme (blueprint) -> formation catalogue
-- =========================================================
-- Quand un programme validé est « basculé au catalogue », on crée une fiche
-- formation et on garde le lien ici (évite la double bascule + affiche un
-- raccourci vers la fiche).
-- =========================================================

alter table public.program_blueprints
  add column if not exists formation_id uuid
    references public.formations(id) on delete set null;

comment on column public.program_blueprints.formation_id is
  'Fiche formation créée par la bascule au catalogue (migration 0124). NULL = pas encore basculé.';
