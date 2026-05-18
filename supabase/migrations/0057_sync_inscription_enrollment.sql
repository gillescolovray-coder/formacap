-- =========================================================================
-- 0057 — Synchronisation bidirectionnelle inscription_requests <-> session_enrollments
--
-- Décision : 2026-05-13. Le module Inscriptions (tableau de bord transversal,
-- riche : OPCO, source, financement) et l'onglet Participants d'une session
-- (statuts admin, niveau, canal) doivent représenter LA MÊME donnée vue
-- sous deux angles. Cf. memory/project_inscription_enrollment_sync.md.
--
-- Stratégie validée : Option C (sync bidirectionnelle, pas de fusion des
-- tables). Les 27 fichiers qui dépendent de session_enrollments (conventions,
-- émargement, attestations, signatures, etc.) restent intacts.
--
-- Cette migration :
--   1. Ajoute une FK `inscription_request_id` sur `session_enrollments`
--      pour relier chaque enrollment à sa demande commerciale d'origine.
--   2. Crée rétroactivement une `inscription_request` pour chaque enrollment
--      qui n'en a pas encore (cas historique : inscriptions directes via
--      l'onglet Participants sans passer par le module Inscriptions).
--
-- La logique de sync (création auto dans le sens inverse, cascade
-- suppression, mapping des statuts) est codée côté application dans les
-- server actions — cette migration n'installe PAS de trigger Postgres
-- pour rester debuggable depuis l'app.
-- =========================================================================

-- ---------------------------------------------------------
-- 1. Colonne FK + index
-- ---------------------------------------------------------
alter table public.session_enrollments
  add column if not exists inscription_request_id uuid
    references public.inscription_requests(id) on delete set null;

create index if not exists idx_session_enrollments_request
  on public.session_enrollments(inscription_request_id);

comment on column public.session_enrollments.inscription_request_id is
  'FK vers la inscription_request miroir (workflow commercial). Sync bidirectionnelle assurée côté application (voir lib/inscriptions/sync.ts).';

-- ---------------------------------------------------------
-- 2. Backfill rétroactif : pour chaque enrollment sans request,
--    crée une request "confirmed" rétro.
--
--    Hypothèses du backfill :
--      - source = 'autre' (impossible de deviner l'historique)
--      - stage_id = stage 'confirmed' de l'organisation (créé par 0025)
--      - financing_mode = 'autofinancement' (défaut neutre)
--      - received_at = enrollment.enrolled_at (cohérence temporelle)
--      - company_id récupéré depuis la fiche apprenant
-- ---------------------------------------------------------
with enrollments_to_backfill as (
  select
    e.id                            as enrollment_id,
    e.session_id,
    e.learner_id,
    e.enrolled_at,
    s.organization_id,
    l.company_id
  from public.session_enrollments e
  join public.sessions s on s.id = e.session_id
  left join public.learners l on l.id = e.learner_id
  where e.inscription_request_id is null
),
confirmed_stages as (
  -- Stage "confirmed" pour chaque organisation. Fallback sur le stage
  -- "is_won = true" si la clé exacte n'existe pas (organisations qui ont
  -- édité leur workflow).
  select distinct on (organization_id)
    organization_id,
    id as stage_id
  from public.inscription_stages
  where is_active = true
    and (key = 'confirmed' or is_won = true)
  order by organization_id,
           case when key = 'confirmed' then 0 else 1 end,
           position
),
inserted_requests as (
  insert into public.inscription_requests (
    organization_id,
    source,
    source_details,
    learner_id,
    company_id,
    target_session_id,
    financing_mode,
    stage_id,
    received_at,
    notes_internal
  )
  select
    eb.organization_id,
    'autre'::public.inscription_source,
    'Backfill 0057 — inscription créée avant la sync',
    eb.learner_id,
    eb.company_id,
    eb.session_id,
    'autofinancement'::public.financing_mode,
    cs.stage_id,
    eb.enrolled_at,
    'Demande créée rétroactivement pour aligner Inscriptions <-> Participants (migration 0057).'
  from enrollments_to_backfill eb
  left join confirmed_stages cs on cs.organization_id = eb.organization_id
  returning id, learner_id, target_session_id
)
update public.session_enrollments e
set inscription_request_id = ir.id
from inserted_requests ir
where e.learner_id = ir.learner_id
  and e.session_id = ir.target_session_id
  and e.inscription_request_id is null;

-- ---------------------------------------------------------
-- 3. Garde-fou : une inscription_request avec target_session_id +
--    learner_id ne peut pas correspondre à plus d'un enrollment dans
--    la même session (la table session_enrollments a déjà l'unicité
--    session_id+learner_id, donc rien à ajouter — juste à documenter).
-- ---------------------------------------------------------
comment on table public.session_enrollments is
  'Inscription d''un apprenant à une session. Synchronisée bidirectionnellement avec inscription_requests via inscription_request_id (migration 0057).';
