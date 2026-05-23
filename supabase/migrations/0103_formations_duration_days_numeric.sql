-- =========================================================
-- Migration 0103 : duration_days accepte les demi-journees
-- =========================================================
-- Passage de INTEGER -> NUMERIC(5,1) pour permettre la saisie
-- de durees en demi-journees (0.5, 1.5, 2.5, etc.).
--
-- Cas d'usage Gilles 2026-05-23 : certaines formations sont
-- dispensees sur une demi-journee (0.5 j = 3.5 h) — ce qui
-- etait impossible avec une colonne INTEGER.
--
-- Contrainte ajoutee : duration_days doit etre un multiple
-- de 0.5 (pas de 0.25, 0.75, etc. — pas de sens metier).
-- =========================================================

alter table public.formations
  alter column duration_days type numeric(5, 1)
  using duration_days::numeric;

alter table public.formations
  drop constraint if exists formations_duration_days_half_day_only;

alter table public.formations
  add constraint formations_duration_days_half_day_only
  check (
    duration_days is null
    or duration_days >= 0
    and (duration_days * 2) = floor(duration_days * 2)
  );

comment on column public.formations.duration_days is
  'Duree en jours (NUMERIC 5.1). Multiple de 0.5 : 0.5 (demi-journee) / 1 / 1.5 / 2 ...';
