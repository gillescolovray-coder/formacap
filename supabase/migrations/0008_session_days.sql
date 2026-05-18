-- =========================================================
-- Migration 0008 : horaires matin/après-midi par jour de session
-- =========================================================
-- Objectif : permettre de saisir des horaires différents pour chaque
-- jour d'une session (ex : lundi 9h-12h / 14h-17h, vendredi 9h-12h
-- seulement). Les anciennes colonnes start_time / end_time de sessions
-- restent (elles servent d'information générale) mais ne sont plus
-- l'unique source de vérité.
-- =========================================================

create table if not exists public.session_days (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.sessions(id) on delete cascade,
  day_date           date not null,
  morning_start      time,
  morning_end        time,
  afternoon_start    time,
  afternoon_end      time,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (session_id, day_date)
);

create index if not exists idx_session_days_session on public.session_days(session_id);
create index if not exists idx_session_days_date    on public.session_days(day_date);

drop trigger if exists session_days_updated_at on public.session_days;
create trigger session_days_updated_at
  before update on public.session_days
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Backfill : pour chaque session existante, générer les jours
-- entre start_date et end_date (avec horaires standards par défaut)
-- ---------------------------------------------------------
insert into public.session_days (session_id, day_date, morning_start, morning_end, afternoon_start, afternoon_end)
select s.id, gs::date, '09:00'::time, '12:00'::time, '14:00'::time, '17:00'::time
from public.sessions s,
     generate_series(s.start_date, s.end_date, interval '1 day') as gs
on conflict (session_id, day_date) do nothing;

-- ---------------------------------------------------------
-- RLS : cascade via session → organisation
-- ---------------------------------------------------------
alter table public.session_days enable row level security;

drop policy if exists "session_days_select_org" on public.session_days;
create policy "session_days_select_org"
  on public.session_days for select
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and public.is_org_member(s.organization_id)
  ));

drop policy if exists "session_days_insert_authorized" on public.session_days;
create policy "session_days_insert_authorized"
  on public.session_days for insert
  with check (exists (
    select 1 from public.sessions s
    where s.id = session_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role)
    )
  ));

drop policy if exists "session_days_update_authorized" on public.session_days;
create policy "session_days_update_authorized"
  on public.session_days for update
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role)
    )
  ));

drop policy if exists "session_days_delete_authorized" on public.session_days;
create policy "session_days_delete_authorized"
  on public.session_days for delete
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role)
    )
  ));
