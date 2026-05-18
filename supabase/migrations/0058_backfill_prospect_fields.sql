-- =========================================================================
-- 0058 — Rattrapage des snapshots prospect_* sur les inscription_requests
--         créées rétroactivement par la migration 0057.
--
-- Contexte : la migration 0057 a créé une `inscription_request` pour chaque
-- `session_enrollment` existant, mais sans copier le nom/prénom/email/
-- téléphone de l'apprenant dans les champs `prospect_*`. Conséquence : les
-- listes du module Inscriptions affichent "—" à la place du nom (le
-- composant utilise `prospect_first_name` en priorité).
--
-- Cette migration met à jour les requests issues du backfill 0057
-- (identifiables via le commentaire dans `source_details`) en y copiant
-- les champs visibles de la fiche apprenant liée.
-- =========================================================================

update public.inscription_requests r
set
  prospect_first_name = coalesce(r.prospect_first_name, l.first_name),
  prospect_last_name  = coalesce(r.prospect_last_name,  l.last_name),
  prospect_email      = coalesce(r.prospect_email,      l.email),
  prospect_phone      = coalesce(r.prospect_phone,      l.phone),
  prospect_birth_date = coalesce(r.prospect_birth_date, l.birth_date)
from public.learners l
where r.learner_id = l.id
  and (
    r.prospect_first_name is null or
    r.prospect_last_name  is null or
    r.prospect_email      is null
  );
