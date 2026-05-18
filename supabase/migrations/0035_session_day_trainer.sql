-- =========================================================================
-- 0035 — Formateur par jour (session_days.trainer_id)
--
-- Une session peut désormais associer un formateur différent à chaque
-- jour. Le formateur principal de la session (sessions.trainer_id) reste
-- la valeur par défaut, mais peut être surchargé jour par jour pour les
-- co-animations, les remplacements, ou les sessions à plusieurs
-- intervenants.
-- =========================================================================

alter table public.session_days
  add column if not exists trainer_id uuid
    references public.trainers(id) on delete set null;

create index if not exists idx_session_days_trainer
  on public.session_days(trainer_id);

comment on column public.session_days.trainer_id is
  'Formateur affecté à ce jour précis. NULL = on utilise le formateur par défaut de la session (sessions.trainer_id).';
