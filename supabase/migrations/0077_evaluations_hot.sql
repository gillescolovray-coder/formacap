-- =========================================================
-- Migration 0077 : Évaluations à chaud (Qualiopi indicateur 11)
-- =========================================================
-- Permet à l'apprenant de remplir le questionnaire de fin de
-- formation. Diffusion via QR code projeté par le formateur en
-- fin de séance (pattern jumeau de l'émargement).
--
-- 1 token par session (porté par tous les apprenants).
-- 1 réponse par enrollment x type (hot = à chaud, cold = à froid V2).
-- =========================================================

-- ---------------------------------------------------------
-- Table : tokens d'évaluation par session (QR code)
-- ---------------------------------------------------------
create table if not exists public.session_evaluation_tokens (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (session_id, token)
);

create index if not exists idx_session_evaluation_tokens_token
  on public.session_evaluation_tokens(token);
create index if not exists idx_session_evaluation_tokens_session
  on public.session_evaluation_tokens(session_id);

comment on table public.session_evaluation_tokens is
  'Tokens publics par session pour le QR code d''évaluation à chaud. Migration 0077.';

alter table public.session_evaluation_tokens enable row level security;

drop policy if exists "session_evaluation_tokens_select_public_via_token"
  on public.session_evaluation_tokens;
create policy "session_evaluation_tokens_select_public_via_token"
  on public.session_evaluation_tokens for select
  using (expires_at > now());

drop policy if exists "session_evaluation_tokens_select_org"
  on public.session_evaluation_tokens;
create policy "session_evaluation_tokens_select_org"
  on public.session_evaluation_tokens for select
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and public.is_org_member(s.organization_id)
    )
  );

drop policy if exists "session_evaluation_tokens_modify_authorized"
  on public.session_evaluation_tokens;
create policy "session_evaluation_tokens_modify_authorized"
  on public.session_evaluation_tokens for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and (
        public.has_org_role(s.organization_id, 'admin'::public.app_role) or
        public.has_org_role(s.organization_id, 'manager'::public.app_role) or
        public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role) or
        public.has_org_role(s.organization_id, 'trainer'::public.app_role)
      )
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and (
        public.has_org_role(s.organization_id, 'admin'::public.app_role) or
        public.has_org_role(s.organization_id, 'manager'::public.app_role) or
        public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role) or
        public.has_org_role(s.organization_id, 'trainer'::public.app_role)
      )
    )
  );

-- ---------------------------------------------------------
-- Table : réponses d'évaluation
-- ---------------------------------------------------------
create table if not exists public.evaluation_responses (
  id                    uuid primary key default gen_random_uuid(),
  enrollment_id         uuid not null references public.session_enrollments(id) on delete cascade,
  -- 'hot' = à chaud (fin de session), 'cold' = à froid (V2, J+90)
  evaluation_type       text not null check (evaluation_type in ('hot', 'cold')),
  -- Toutes les réponses en JSON (flexibilité pour faire évoluer
  -- le questionnaire sans migration).
  data                  jsonb not null,
  -- NPS extrait pour agrégation rapide (recommandation 0-10).
  nps_score             integer check (nps_score between 0 and 10),
  -- Satisfaction globale extraite pour KPI Qualiopi.
  satisfaction_overall  text check (
    satisfaction_overall in (
      'very_satisfied', 'satisfied', 'medium', 'unsatisfied'
    )
  ),
  submitted_at          timestamptz not null default now(),
  submitted_ip          text,
  submitted_user_agent  text,
  -- Un apprenant ne remplit qu'une fois par type d'évaluation.
  unique (enrollment_id, evaluation_type)
);

create index if not exists idx_evaluation_responses_enrollment
  on public.evaluation_responses(enrollment_id);
create index if not exists idx_evaluation_responses_type_date
  on public.evaluation_responses(evaluation_type, submitted_at);

comment on table public.evaluation_responses is
  'Réponses aux évaluations à chaud (Qualiopi 11) et à froid (Qualiopi 30). Migration 0077.';

alter table public.evaluation_responses enable row level security;

-- SELECT pour les membres de l'organisation
drop policy if exists "evaluation_responses_select_org"
  on public.evaluation_responses;
create policy "evaluation_responses_select_org"
  on public.evaluation_responses for select
  using (
    exists (
      select 1
      from public.session_enrollments e
      join public.sessions s on s.id = e.session_id
      where e.id = enrollment_id and public.is_org_member(s.organization_id)
    )
  );

-- INSERT : autorisé pour les rôles internes (admin saisit pour un apprenant).
-- L'insertion par la PAGE PUBLIQUE passera par client service_role
-- (bypass RLS), avec validation applicative du token.
drop policy if exists "evaluation_responses_insert_authorized"
  on public.evaluation_responses;
create policy "evaluation_responses_insert_authorized"
  on public.evaluation_responses for insert
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

-- DELETE : réservé aux admin/manager (cas d'erreur, RGPD).
drop policy if exists "evaluation_responses_delete_authorized"
  on public.evaluation_responses;
create policy "evaluation_responses_delete_authorized"
  on public.evaluation_responses for delete
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
