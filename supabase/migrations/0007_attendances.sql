-- =========================================================
-- Migration 0007 : émargement (§6.7 cahier des charges)
-- =========================================================
-- Objectif : enregistrer la présence des apprenants aux sessions,
-- par journée. Une ligne par apprenant × par jour de session.
-- La granularité demi-journée pourra être ajoutée plus tard via
-- une colonne 'moment' si besoin Qualiopi.
-- =========================================================

do $$ begin
  create type public.attendance_status as enum (
    'not_recorded',
    'present',
    'absent',
    'excused',
    'late'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.attendances (
  id              uuid primary key default gen_random_uuid(),
  enrollment_id   uuid not null references public.session_enrollments(id) on delete cascade,
  period_date     date not null,
  status          public.attendance_status not null default 'not_recorded',
  note            text,
  marked_by       uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (enrollment_id, period_date)
);

create index if not exists idx_attendances_enrollment on public.attendances(enrollment_id);
create index if not exists idx_attendances_date       on public.attendances(period_date);

drop trigger if exists attendances_updated_at on public.attendances;
create trigger attendances_updated_at
  before update on public.attendances
  for each row execute function public.set_updated_at();

comment on table public.attendances is 'Émargement : présence des apprenants par jour de session';

-- ---------------------------------------------------------
-- RLS : cascade via enrollment → session → organisation
-- ---------------------------------------------------------
alter table public.attendances enable row level security;

drop policy if exists "attendances_select_org" on public.attendances;
create policy "attendances_select_org"
  on public.attendances for select
  using (exists (
    select 1
    from public.session_enrollments e
    join public.sessions s on s.id = e.session_id
    where e.id = enrollment_id and public.is_org_member(s.organization_id)
  ));

drop policy if exists "attendances_insert_authorized" on public.attendances;
create policy "attendances_insert_authorized"
  on public.attendances for insert
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

drop policy if exists "attendances_update_authorized" on public.attendances;
create policy "attendances_update_authorized"
  on public.attendances for update
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
  ));

drop policy if exists "attendances_delete_authorized" on public.attendances;
create policy "attendances_delete_authorized"
  on public.attendances for delete
  using (exists (
    select 1
    from public.session_enrollments e
    join public.sessions s on s.id = e.session_id
    where e.id = enrollment_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role)
    )
  ));
