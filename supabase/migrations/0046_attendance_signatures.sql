-- =========================================================
-- Migration 0046 : Signatures électroniques d'émargement
-- =========================================================
-- Stocke les signatures numériques (image PNG en base64) des
-- apprenants et formateurs, par demi-journée. Permet de
-- générer une feuille d'émargement signée transmissible aux
-- OPCO sans support papier.

create table if not exists public.attendance_signatures (
  id                uuid primary key default gen_random_uuid(),
  enrollment_id     uuid not null references public.session_enrollments(id)
                      on delete cascade,
  period_date       date not null,
  moment            text not null check (moment in ('morning', 'afternoon')),
  signer_role       text not null check (signer_role in ('learner', 'trainer')),
  signer_name       text not null,
  -- Image PNG encodée en data URL : "data:image/png;base64,iVBOR..."
  signature_data    text not null,
  signed_ip         text,
  signed_user_agent text,
  signed_at         timestamptz not null default now(),
  unique (enrollment_id, period_date, moment, signer_role)
);

create index if not exists idx_attendance_signatures_enrollment
  on public.attendance_signatures(enrollment_id);
create index if not exists idx_attendance_signatures_date
  on public.attendance_signatures(period_date);

comment on table public.attendance_signatures is
  'Signatures electroniques (image PNG en base64) des emargements, par enrollment x date x moment x role. Sert a generer une feuille d''emargement signee pour les OPCO.';

-- ---------------------------------------------------------
-- RLS : meme pattern que la table attendances (cf. 0007)
-- ---------------------------------------------------------
alter table public.attendance_signatures enable row level security;

drop policy if exists "attendance_signatures_select_org"
  on public.attendance_signatures;
create policy "attendance_signatures_select_org"
  on public.attendance_signatures for select
  using (exists (
    select 1
    from public.session_enrollments e
    join public.sessions s on s.id = e.session_id
    where e.id = enrollment_id and public.is_org_member(s.organization_id)
  ));

drop policy if exists "attendance_signatures_insert_authorized"
  on public.attendance_signatures;
create policy "attendance_signatures_insert_authorized"
  on public.attendance_signatures for insert
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

drop policy if exists "attendance_signatures_update_authorized"
  on public.attendance_signatures;
create policy "attendance_signatures_update_authorized"
  on public.attendance_signatures for update
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

drop policy if exists "attendance_signatures_delete_authorized"
  on public.attendance_signatures;
create policy "attendance_signatures_delete_authorized"
  on public.attendance_signatures for delete
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
