-- =========================================================
-- Migration 0042 : Horaires par défaut au niveau organisation
-- =========================================================
-- Permet à un admin de définir les horaires "maison" (matin/A-M)
-- depuis les Paramètres. Toute nouvelle session hérite de ces
-- valeurs ; on peut toujours les surcharger jour par jour dans
-- le planning détaillé.

alter table public.organizations
  add column if not exists default_morning_start    time,
  add column if not exists default_morning_end      time,
  add column if not exists default_afternoon_start  time,
  add column if not exists default_afternoon_end    time;

comment on column public.organizations.default_morning_start is
  'Horaire de debut du matin par defaut, applique aux nouvelles sessions.';
comment on column public.organizations.default_morning_end is
  'Horaire de fin du matin par defaut, applique aux nouvelles sessions.';
comment on column public.organizations.default_afternoon_start is
  'Horaire de debut de l''apres-midi par defaut, applique aux nouvelles sessions.';
comment on column public.organizations.default_afternoon_end is
  'Horaire de fin de l''apres-midi par defaut, applique aux nouvelles sessions.';
