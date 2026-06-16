-- 0130 — Réaligner le formateur PRINCIPAL des sessions sur le formateur du
-- PLANNING (Gilles 2026-06-17).
--
-- Contexte : l'UI « formateur principal » a été supprimée ; le formateur est
-- choisi jour par jour (session_days.trainer_id). Mais sessions.trainer_id
-- conservait son ANCIENNE valeur (figée), utilisée par la convocation
-- formateur ET la colonne « Formateur » du tableau → mauvais destinataire et
-- mauvais affichage (ex. « Gilles COLOVRAY » au lieu du vrai formateur).
--
-- Ce backfill aligne, pour chaque session ayant au moins un jour avec un
-- formateur, sessions.trainer_id sur le formateur du 1er jour (chronologique),
-- et efface trainer_name (texte libre) pour que l'affichage utilise la
-- jointure formateur. Les sessions sans formateur de jour ne sont pas touchées.

update sessions s
set trainer_id = dt.trainer_id,
    trainer_name = null
from (
  select distinct on (sd.session_id)
    sd.session_id,
    sd.trainer_id
  from session_days sd
  where sd.trainer_id is not null
  order by sd.session_id, sd.day_date asc
) dt
where dt.session_id = s.id
  and (
    s.trainer_id is distinct from dt.trainer_id
    or s.trainer_name is not null
  );
