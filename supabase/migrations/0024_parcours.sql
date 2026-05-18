-- =========================================================
-- Migration 0024 : Parcours de formation
-- =========================================================
-- Un parcours regroupe plusieurs sessions avec des modalites
-- differentes (presentiel, distanciel, e-learning, hybride...).
-- Chaque session conserve son propre formateur, ses dates, sa modalite.
-- =========================================================

do $$ begin
  create type public.parcours_status as enum (
    'draft',       -- brouillon
    'planned',     -- planifié
    'in_progress', -- en cours
    'completed',   -- terminé
    'cancelled',   -- annulé
    'archived'     -- archivé
  );
exception when duplicate_object then null; end $$;

create table if not exists public.parcours (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  name            text not null,
  internal_code   text,
  description     text,
  target_audience text,
  general_objective text,
  prerequisites   text,
  notes           text,

  status          public.parcours_status not null default 'draft',
  is_active       boolean not null default true,

  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_parcours_org    on public.parcours(organization_id);
create index if not exists idx_parcours_status on public.parcours(status);

drop trigger if exists parcours_updated_at on public.parcours;
create trigger parcours_updated_at
  before update on public.parcours
  for each row execute function public.set_updated_at();

-- Lien parcours <-> session
alter table public.sessions
  add column if not exists parcours_id       uuid
    references public.parcours(id) on delete set null,
  add column if not exists parcours_position int;

create index if not exists idx_sessions_parcours
  on public.sessions(parcours_id, parcours_position);

comment on column public.sessions.parcours_id is
  'Si renseigne, cette session fait partie d''un parcours.';
comment on column public.sessions.parcours_position is
  'Ordre de la session a l''interieur du parcours (1, 2, 3...)';

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.parcours enable row level security;

drop policy if exists "parcours_select_org" on public.parcours;
create policy "parcours_select_org"
  on public.parcours for select
  using (public.is_org_member(organization_id));

drop policy if exists "parcours_insert_authorized" on public.parcours;
create policy "parcours_insert_authorized"
  on public.parcours for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

drop policy if exists "parcours_update_authorized" on public.parcours;
create policy "parcours_update_authorized"
  on public.parcours for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

drop policy if exists "parcours_delete_admin" on public.parcours;
create policy "parcours_delete_admin"
  on public.parcours for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));
