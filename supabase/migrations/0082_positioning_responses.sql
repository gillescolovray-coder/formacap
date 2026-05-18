-- =========================================================
-- Migration 0082 : Réponses au test de positionnement
-- =========================================================
-- Qualiopi indicateur 12 (positionnement de l'apprenant).
--
-- L'apprenant remplit avant le démarrage de la formation depuis
-- son portail (/mon-parcours/<token>/positionnement). Le formateur
-- consulte les réponses et peut ajouter son observation pédagogique
-- (V2). Sprint D.
--
-- Une seule réponse par apprenant × session (unique enrollment_id).
-- Format JSONB pour évolutivité du questionnaire sans migration.
-- =========================================================

create table if not exists public.positioning_responses (
  id                  uuid primary key default gen_random_uuid(),
  enrollment_id       uuid not null unique
                        references public.session_enrollments(id) on delete cascade,
  -- Réponses apprenant aux sections 1-6 (cf. lib/positioning/types.ts)
  data                jsonb not null,
  -- Signature facultative apprenant (data URL PNG, jamais réutilisable)
  learner_signature   text,
  -- Section 7 : observation formateur (rempli APRÈS lecture, V2)
  trainer_observation jsonb,
  -- Audit
  learner_submitted_at timestamptz not null default now(),
  trainer_filled_at    timestamptz,
  submitted_ip         text,
  submitted_user_agent text
);

create index if not exists idx_positioning_responses_enrollment
  on public.positioning_responses(enrollment_id);
create index if not exists idx_positioning_responses_submitted
  on public.positioning_responses(learner_submitted_at);

comment on table public.positioning_responses is
  'Réponses au test de positionnement Qualiopi (indicateur 12). Migration 0082.';

-- ---------------------------------------------------------
-- RLS : membres org en lecture, INSERT depuis page publique via
-- service_role (token portail apprenant vaut authentification).
-- ---------------------------------------------------------
alter table public.positioning_responses enable row level security;

drop policy if exists "positioning_responses_select_org"
  on public.positioning_responses;
create policy "positioning_responses_select_org"
  on public.positioning_responses for select
  using (
    exists (
      select 1
      from public.session_enrollments e
      join public.sessions s on s.id = e.session_id
      where e.id = enrollment_id and public.is_org_member(s.organization_id)
    )
  );

drop policy if exists "positioning_responses_insert_authorized"
  on public.positioning_responses;
create policy "positioning_responses_insert_authorized"
  on public.positioning_responses for insert
  with check (
    exists (
      select 1
      from public.session_enrollments e
      join public.sessions s on s.id = e.session_id
      where e.id = enrollment_id and (
        public.has_org_role(s.organization_id, 'admin'::public.app_role) or
        public.has_org_role(s.organization_id, 'manager'::public.app_role) or
        public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role) or
        public.has_org_role(s.organization_id, 'trainer'::public.app_role)
      )
    )
  );

drop policy if exists "positioning_responses_update_authorized"
  on public.positioning_responses;
create policy "positioning_responses_update_authorized"
  on public.positioning_responses for update
  using (
    exists (
      select 1
      from public.session_enrollments e
      join public.sessions s on s.id = e.session_id
      where e.id = enrollment_id and (
        public.has_org_role(s.organization_id, 'admin'::public.app_role) or
        public.has_org_role(s.organization_id, 'manager'::public.app_role) or
        public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role) or
        public.has_org_role(s.organization_id, 'trainer'::public.app_role)
      )
    )
  );

drop policy if exists "positioning_responses_delete_authorized"
  on public.positioning_responses;
create policy "positioning_responses_delete_authorized"
  on public.positioning_responses for delete
  using (
    exists (
      select 1
      from public.session_enrollments e
      join public.sessions s on s.id = e.session_id
      where e.id = enrollment_id and (
        public.has_org_role(s.organization_id, 'admin'::public.app_role) or
        public.has_org_role(s.organization_id, 'manager'::public.app_role)
      )
    )
  );
