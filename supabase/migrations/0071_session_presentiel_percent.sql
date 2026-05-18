-- Pourcentage d'enseignement en présentiel pour les sessions hybrides.
--
-- Lorsque la session est en modalité « hybride » (présentiel + distanciel
-- combinés), la convention de formation doit indiquer la répartition
-- exacte (ex: 70 % en présentiel / 30 % en distanciel).
--
-- On stocke uniquement le % en présentiel (0-100) ; le % en distanciel
-- se déduit automatiquement (100 - presentiel_percent).
--
-- Champ optionnel et propre à chaque session (deux sessions du même
-- programme peuvent avoir des répartitions différentes).

alter table public.sessions
  add column if not exists presentiel_percent smallint
    check (presentiel_percent is null or (presentiel_percent between 0 and 100));

comment on column public.sessions.presentiel_percent is
  'Pour les sessions hybrides : pourcentage du temps de formation effectué en présentiel (0-100). Le distanciel se déduit comme 100 - presentiel_percent. Affiché dans l''article I de la convention.';
