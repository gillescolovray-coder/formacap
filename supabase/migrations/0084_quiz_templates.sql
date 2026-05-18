-- =========================================================
-- Migration 0084 : Module Quiz d'évaluation pédagogique
-- =========================================================
-- Bibliothèque de quiz personnalisables (pattern La Quizinière).
-- Chaque quiz contient N questions (QCM single/multiple, vrai-faux,
-- texte). Joué 2 fois par l'apprenant : pré-formation (matin) et
-- post-formation (soir) → mesure de progression.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Modèles de quiz (bibliothèque)
-- ---------------------------------------------------------
create table if not exists public.quiz_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  description     text,
  -- 'draft' = en cours d'édition admin
  -- 'pending_review' = proposé par formateur, en attente validation admin
  -- 'published' = utilisable sur formations/sessions
  -- 'archived' = retiré de la liste active (conservé pour historique)
  status          text not null default 'draft'
                    check (status in ('draft','pending_review','published','archived')),
  -- Créateur : soit un profil Supabase (admin/manager), soit un formateur
  -- du portail (pas de compte Auth). Un seul des deux est rempli.
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_trainer_id uuid references public.trainers(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_quiz_templates_org_status
  on public.quiz_templates(organization_id, status);

create trigger quiz_templates_updated_at
  before update on public.quiz_templates
  for each row execute function public.set_updated_at();

comment on table public.quiz_templates is
  'Modèles de quiz d''évaluation (pré/post session). Migration 0084.';

-- ---------------------------------------------------------
-- 2. Questions d'un quiz
-- ---------------------------------------------------------
create table if not exists public.quiz_questions (
  id               uuid primary key default gen_random_uuid(),
  quiz_template_id uuid not null references public.quiz_templates(id) on delete cascade,
  position         integer not null default 0,
  -- Types V1 : qcm_single, qcm_multiple, true_false, text_exact
  type             text not null
                     check (type in ('qcm_single','qcm_multiple','true_false','text_exact')),
  text             text not null,                  -- énoncé
  -- Options de réponse (qcm) ou null (true_false/text_exact)
  -- Format JSONB : [{ id: 'a', label: 'OUI' }, { id: 'b', label: 'NON' }]
  options          jsonb,
  -- Bonne(s) réponse(s) au format JSONB :
  -- qcm_single   : "a"
  -- qcm_multiple : ["a","c"]
  -- true_false   : true ou false
  -- text_exact   : "réponse attendue"
  correct_answer   jsonb not null,
  points           integer not null default 1 check (points >= 0),
  -- Explication affichée dans le corrigé après passation
  explanation      text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_quiz_questions_template_position
  on public.quiz_questions(quiz_template_id, position);

comment on table public.quiz_questions is
  'Questions individuelles d''un quiz, ordonnées par position. Migration 0084.';

-- ---------------------------------------------------------
-- 3. Liaison Quiz ↔ Formation (catalogue) / Session (override)
-- ---------------------------------------------------------
alter table public.formations
  add column if not exists quiz_template_id uuid
    references public.quiz_templates(id) on delete set null;

alter table public.sessions
  add column if not exists quiz_template_id uuid
    references public.quiz_templates(id) on delete set null;

comment on column public.formations.quiz_template_id is
  'Quiz par défaut pour toutes les sessions de cette formation. Migration 0084.';
comment on column public.sessions.quiz_template_id is
  'Override quiz spécifique à cette session (sinon hérite de la formation). Migration 0084.';

-- ---------------------------------------------------------
-- 4. Tentatives apprenants (pré + post)
-- ---------------------------------------------------------
create table if not exists public.quiz_attempts (
  id                uuid primary key default gen_random_uuid(),
  enrollment_id     uuid not null references public.session_enrollments(id) on delete cascade,
  quiz_template_id  uuid not null references public.quiz_templates(id) on delete cascade,
  -- 'pre' = avant la formation (matin), 'post' = après (soir)
  phase             text not null check (phase in ('pre','post')),
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  score             integer,                    -- points obtenus
  max_score         integer,                    -- points maximum possibles
  -- Réponses détaillées de l'apprenant + correctness par question
  -- Format JSONB : [{ question_id, answer, is_correct, points_earned }]
  data              jsonb,
  submitted_ip      text,
  submitted_user_agent text,
  -- Un apprenant ne peut faire la phase pre/post qu'une seule fois
  unique (enrollment_id, quiz_template_id, phase)
);

create index if not exists idx_quiz_attempts_enrollment
  on public.quiz_attempts(enrollment_id);
create index if not exists idx_quiz_attempts_quiz_phase
  on public.quiz_attempts(quiz_template_id, phase);

comment on table public.quiz_attempts is
  'Tentatives apprenant pré/post sur un quiz. Une par couple (enrollment × quiz × phase). Migration 0084.';

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.quiz_templates enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;

-- Quiz templates : lecture pour membres org, écriture admin/manager/pedagogy_lead/trainer
drop policy if exists "quiz_templates_select_org" on public.quiz_templates;
create policy "quiz_templates_select_org"
  on public.quiz_templates for select
  using (public.is_org_member(organization_id));

drop policy if exists "quiz_templates_insert_authorized" on public.quiz_templates;
create policy "quiz_templates_insert_authorized"
  on public.quiz_templates for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

drop policy if exists "quiz_templates_update_authorized" on public.quiz_templates;
create policy "quiz_templates_update_authorized"
  on public.quiz_templates for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  )
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

drop policy if exists "quiz_templates_delete_authorized" on public.quiz_templates;
create policy "quiz_templates_delete_authorized"
  on public.quiz_templates for delete
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role)
  );

-- Quiz questions : héritent des permissions du template via jointure
drop policy if exists "quiz_questions_select_org" on public.quiz_questions;
create policy "quiz_questions_select_org"
  on public.quiz_questions for select
  using (exists (
    select 1 from public.quiz_templates qt
    where qt.id = quiz_template_id and public.is_org_member(qt.organization_id)
  ));

drop policy if exists "quiz_questions_modify_authorized" on public.quiz_questions;
create policy "quiz_questions_modify_authorized"
  on public.quiz_questions for all
  using (exists (
    select 1 from public.quiz_templates qt
    where qt.id = quiz_template_id and (
      public.has_org_role(qt.organization_id, 'admin'::public.app_role) or
      public.has_org_role(qt.organization_id, 'manager'::public.app_role) or
      public.has_org_role(qt.organization_id, 'pedagogy_lead'::public.app_role)
    )
  ))
  with check (exists (
    select 1 from public.quiz_templates qt
    where qt.id = quiz_template_id and (
      public.has_org_role(qt.organization_id, 'admin'::public.app_role) or
      public.has_org_role(qt.organization_id, 'manager'::public.app_role) or
      public.has_org_role(qt.organization_id, 'pedagogy_lead'::public.app_role)
    )
  ));

-- Quiz attempts : lecture par membres org de la session, INSERT/UPDATE
-- depuis page publique via service_role (token portail apprenant).
drop policy if exists "quiz_attempts_select_org" on public.quiz_attempts;
create policy "quiz_attempts_select_org"
  on public.quiz_attempts for select
  using (exists (
    select 1
    from public.session_enrollments e
    join public.sessions s on s.id = e.session_id
    where e.id = enrollment_id and public.is_org_member(s.organization_id)
  ));

drop policy if exists "quiz_attempts_modify_authorized" on public.quiz_attempts;
create policy "quiz_attempts_modify_authorized"
  on public.quiz_attempts for all
  using (exists (
    select 1
    from public.session_enrollments e
    join public.sessions s on s.id = e.session_id
    where e.id = enrollment_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role) or
      public.has_org_role(s.organization_id, 'trainer'::public.app_role)
    )
  ))
  with check (exists (
    select 1
    from public.session_enrollments e
    join public.sessions s on s.id = e.session_id
    where e.id = enrollment_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role) or
      public.has_org_role(s.organization_id, 'trainer'::public.app_role)
    )
  ));
