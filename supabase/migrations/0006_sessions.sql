-- =========================================================
-- Migration 0006 : sessions de formation + inscriptions
-- =========================================================
-- Objectif : couvrir §6.3 (planification sessions) et §6.5
-- (inscriptions apprenants) du cahier des charges.
-- =========================================================

-- État du cycle de vie d'une session
create type public.session_status as enum (
  'draft',         -- brouillon
  'planned',       -- planifiée
  'confirmed',     -- confirmée (inscriptions bouclées)
  'in_progress',   -- en cours
  'completed',     -- terminée
  'cancelled',     -- annulée
  'postponed'      -- reportée
);

-- Statut d'une inscription (§6.5 cahier des charges)
create type public.enrollment_status as enum (
  'preinscrit',
  'option',
  'confirmed',
  'convoque',
  'in_progress',
  'completed',
  'cancelled',
  'absent',
  'abandoned'
);

-- ---------------------------------------------------------
-- Table: sessions
-- ---------------------------------------------------------
create table public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  formation_id       uuid not null references public.formations(id) on delete restrict,

  -- Planning
  start_date         date not null,
  end_date           date not null,
  start_time         time,
  end_time           time,

  -- Logistique
  modality           public.formation_modality,
  location           text,
  video_link         text,

  -- Formateur (MVP : texte libre — un module formateurs dédié arrivera plus tard)
  trainer_name       text,
  trainer_notes      text,

  -- Capacité
  min_participants   integer,
  max_participants   integer,

  -- Gestion
  status             public.session_status not null default 'draft',
  notes              text,

  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  check (end_date >= start_date),
  check (max_participants is null or min_participants is null or max_participants >= min_participants)
);

create index idx_sessions_org       on public.sessions(organization_id);
create index idx_sessions_formation on public.sessions(formation_id);
create index idx_sessions_dates     on public.sessions(start_date, end_date);
create index idx_sessions_status    on public.sessions(status);

create trigger sessions_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

comment on table public.sessions is 'Sessions de formation (dates, lieu, formateur, capacité)';

-- ---------------------------------------------------------
-- Table: session_enrollments
-- ---------------------------------------------------------
create table public.session_enrollments (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions(id) on delete cascade,
  learner_id    uuid not null references public.learners(id) on delete restrict,

  status        public.enrollment_status not null default 'preinscrit',
  notes         text,

  enrolled_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (session_id, learner_id)
);

create index idx_enrollments_session on public.session_enrollments(session_id);
create index idx_enrollments_learner on public.session_enrollments(learner_id);
create index idx_enrollments_status  on public.session_enrollments(status);

create trigger session_enrollments_updated_at
  before update on public.session_enrollments
  for each row execute function public.set_updated_at();

comment on table public.session_enrollments is 'Inscription d''un apprenant à une session';

-- ---------------------------------------------------------
-- Row Level Security : sessions
-- ---------------------------------------------------------
alter table public.sessions enable row level security;

create policy "sessions_select_org"
  on public.sessions for select
  using (public.is_org_member(organization_id));

create policy "sessions_insert_authorized"
  on public.sessions for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "sessions_update_authorized"
  on public.sessions for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "sessions_delete_admin"
  on public.sessions for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));

-- ---------------------------------------------------------
-- Row Level Security : enrollments (cascade via session)
-- ---------------------------------------------------------
alter table public.session_enrollments enable row level security;

create policy "enrollments_select_org"
  on public.session_enrollments for select
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and public.is_org_member(s.organization_id)
  ));

create policy "enrollments_insert_authorized"
  on public.session_enrollments for insert
  with check (exists (
    select 1 from public.sessions s
    where s.id = session_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role)
    )
  ));

create policy "enrollments_update_authorized"
  on public.session_enrollments for update
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role)
    )
  ));

create policy "enrollments_delete_authorized"
  on public.session_enrollments for delete
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role)
    )
  ));
