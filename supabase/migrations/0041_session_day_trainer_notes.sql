-- =========================================================
-- Migration 0041 : Consignes formateur par jour
-- =========================================================
-- Ajoute une colonne `trainer_notes` à `session_days` pour
-- stocker des consignes/recommandations destinées au formateur,
-- par journée de formation.

alter table public.session_days
  add column if not exists trainer_notes text;

comment on column public.session_days.trainer_notes is
  'Consignes/recommandations destinees au formateur pour ce jour specifique (texte libre).';
