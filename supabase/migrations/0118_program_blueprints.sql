-- =========================================================
-- Migration 0118 : Module de conception de programmes (Bloom)
-- =========================================================
-- Espace de CONCEPTION séparé du catalogue : on conçoit un programme
-- (objectifs opérationnels étiquetés selon la taxonomie de Bloom), il
-- est validé par le référent pédagogique (Porte 1), puis (sprints
-- suivants) on génère déroulé / quiz / positionnement avant publication.
--
-- Tant qu'un programme n'est pas entièrement validé, il reste ICI et
-- n'apparaît PAS au catalogue (formations).
-- =========================================================

create table if not exists public.program_blueprints (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,

  internal_code      text,                 -- Référence (ex. FP-AOV1)
  title              text not null,
  theme              text,                 -- Thème / catégorie libre
  target_audience    text,                 -- Publics visés
  duration_hours     numeric(6, 1),
  duration_days      numeric(5, 1),
  general_objective  text,                 -- Objectif général

  -- Objectifs opérationnels étiquetés Bloom :
  -- [{ "id": "uuid", "text": "...", "bloom_level": "apply",
  --    "action_verb": "réaliser" }, ...]
  bloom_objectives   jsonb not null default '[]'::jsonb,

  -- Cycle de vie (Sprint A : conception + Porte 1 objectifs) :
  --  draft               = en cours de conception
  --  pending_review      = objectifs soumis au référent (Porte 1)
  --  objectives_approved = objectifs validés (prêt pour génération)
  --  changes_requested   = renvoyé par le référent avec commentaires
  status             text not null default 'draft'
                       check (status in (
                         'draft','pending_review',
                         'objectives_approved','changes_requested'
                       )),

  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_program_blueprints_org
  on public.program_blueprints(organization_id);
create index if not exists idx_program_blueprints_status
  on public.program_blueprints(organization_id, status);

comment on table public.program_blueprints is
  'Brouillons de programmes en conception (objectifs Bloom + workflow de validation). Isolés du catalogue tant que non publiés. Migration 0118.';

-- Journal des validations (traçabilité Qualiopi).
create table if not exists public.program_blueprint_reviews (
  id            uuid primary key default gen_random_uuid(),
  blueprint_id  uuid not null references public.program_blueprints(id) on delete cascade,
  step          text not null default 'objectives'
                  check (step in ('objectives','final')),
  decision      text not null check (decision in ('approved','changes_requested')),
  comment       text,
  reviewer_id   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_program_blueprint_reviews_bp
  on public.program_blueprint_reviews(blueprint_id);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.program_blueprints enable row level security;
alter table public.program_blueprint_reviews enable row level security;

-- Lecture : tout membre de l'organisation.
drop policy if exists "program_blueprints_select" on public.program_blueprints;
create policy "program_blueprints_select"
  on public.program_blueprints for select
  using (public.is_org_member(organization_id));

-- Création / modification : admin, manager, référent pédagogique.
drop policy if exists "program_blueprints_write" on public.program_blueprints;
create policy "program_blueprints_write"
  on public.program_blueprints for all
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

-- Reviews : lecture par membres, écriture par référent + admin.
drop policy if exists "program_blueprint_reviews_select"
  on public.program_blueprint_reviews;
create policy "program_blueprint_reviews_select"
  on public.program_blueprint_reviews for select
  using (
    exists (
      select 1 from public.program_blueprints b
      where b.id = blueprint_id and public.is_org_member(b.organization_id)
    )
  );

drop policy if exists "program_blueprint_reviews_insert"
  on public.program_blueprint_reviews;
create policy "program_blueprint_reviews_insert"
  on public.program_blueprint_reviews for insert
  with check (
    exists (
      select 1 from public.program_blueprints b
      where b.id = blueprint_id and (
        public.has_org_role(b.organization_id, 'admin'::public.app_role) or
        public.has_org_role(b.organization_id, 'pedagogy_lead'::public.app_role)
      )
    )
  );
