-- =========================================================================
-- 0059 — Déduplication des inscription_requests par (target_session_id, learner_id)
--
-- Contexte : la migration 0057 a créé une inscription_request rétroactive
-- pour CHAQUE session_enrollment, SANS vérifier si une request préexistait
-- déjà pour le même couple (session, apprenant). Conséquence visible chez
-- Gilles le 2026-05-13 : un apprenant déjà présent dans Inscriptions s'est
-- retrouvé en doublon (request d'origine + request backfill).
--
-- Cette migration :
--   1. Pour chaque (target_session_id, learner_id), identifie les
--      duplicates et conserve la PLUS ANCIENNE (received_at min, puis
--      created_at min en cas d'égalité).
--   2. Re-pointe tous les session_enrollments qui pointent vers une
--      request à supprimer → vers la request conservée.
--   3. Re-pointe les inscription_events (timeline) idem (FK
--      request_id avec on delete cascade serait perdue sinon).
--   4. Supprime les requests doublons.
-- =========================================================================

-- Étape 0 : repérer les groupes de doublons
with grouped as (
  select
    target_session_id,
    learner_id,
    -- Pour chaque doublon, on garde la plus ancienne (rang 1)
    id,
    row_number() over (
      partition by target_session_id, learner_id
      order by received_at asc nulls last, created_at asc, id asc
    ) as rk
  from public.inscription_requests
  where target_session_id is not null
    and learner_id is not null
),
keepers as (
  select target_session_id, learner_id, id as keeper_id
  from grouped where rk = 1
),
duplicates as (
  select g.id as dup_id, k.keeper_id
  from grouped g
  join keepers k
    on k.target_session_id = g.target_session_id
   and k.learner_id        = g.learner_id
  where g.rk > 1
)
-- Étape 1 : re-pointer les session_enrollments orphelins (FK on delete
-- set null) vers la request conservée AVANT suppression.
update public.session_enrollments e
set inscription_request_id = d.keeper_id
from duplicates d
where e.inscription_request_id = d.dup_id;

-- Étape 2 : re-pointer les inscription_events (cascade = on delete cascade,
-- mais on préfère préserver l'historique en le rattachant à la request
-- conservée plutôt que de le perdre à la suppression du doublon).
with grouped as (
  select
    target_session_id,
    learner_id,
    id,
    row_number() over (
      partition by target_session_id, learner_id
      order by received_at asc nulls last, created_at asc, id asc
    ) as rk
  from public.inscription_requests
  where target_session_id is not null
    and learner_id is not null
),
keepers as (
  select target_session_id, learner_id, id as keeper_id
  from grouped where rk = 1
),
duplicates as (
  select g.id as dup_id, k.keeper_id
  from grouped g
  join keepers k
    on k.target_session_id = g.target_session_id
   and k.learner_id        = g.learner_id
  where g.rk > 1
)
update public.inscription_events ev
set request_id = d.keeper_id
from duplicates d
where ev.request_id = d.dup_id;

-- Étape 3 : suppression effective des doublons.
with grouped as (
  select
    target_session_id,
    learner_id,
    id,
    row_number() over (
      partition by target_session_id, learner_id
      order by received_at asc nulls last, created_at asc, id asc
    ) as rk
  from public.inscription_requests
  where target_session_id is not null
    and learner_id is not null
)
delete from public.inscription_requests r
using grouped g
where r.id = g.id and g.rk > 1;

-- Étape 4 : pour les enrollments qui n'avaient pas encore d'inscription_request_id
-- (cas où le backfill 0057 n'a pas matché), tenter une dernière liaison
-- sur (session_id, learner_id).
update public.session_enrollments e
set inscription_request_id = ir.id
from public.inscription_requests ir
where e.inscription_request_id is null
  and ir.target_session_id = e.session_id
  and ir.learner_id        = e.learner_id;

-- Étape 5 : index unique pour empêcher tout futur doublon en BDD.
-- (NULL autorisés : on ne contraint que les couples non-null)
create unique index if not exists uniq_inscription_request_session_learner
  on public.inscription_requests(target_session_id, learner_id)
  where target_session_id is not null
    and learner_id is not null;

comment on index public.uniq_inscription_request_session_learner is
  'Empêche les doublons de demande pour un même couple (session, apprenant). Mise en place par la migration 0059 le 2026-05-13.';
