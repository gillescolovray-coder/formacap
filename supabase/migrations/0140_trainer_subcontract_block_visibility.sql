-- Portail formateur en sous-traitance (Gilles 2026-06-26) : par défaut, les
-- volets Positionnement / Émargement / Évaluation à chaud sont MASQUÉS (gérés
-- par l'OF donneur d'ordre). Le formateur peut les afficher au cas par cas ;
-- son choix est mémorisé PAR SESSION via ces drapeaux.
alter table public.sessions
  add column if not exists trainer_show_positionnement boolean not null default false,
  add column if not exists trainer_show_emargement     boolean not null default false,
  add column if not exists trainer_show_evaluation     boolean not null default false;
