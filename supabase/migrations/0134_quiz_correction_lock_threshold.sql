-- Quiz : correction admin + verrouillage + seuil de réussite + rejeu tracé
-- (Gilles 2026-06-23).

-- 1. Verrou des résultats quiz au niveau session (mirror admin_closed_at).
alter table public.sessions
  add column if not exists quiz_results_locked_at timestamptz,
  add column if not exists quiz_results_locked_by uuid references auth.users(id);

-- 2. Traçabilité des corrections manuelles sur une tentative.
alter table public.quiz_attempts
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references auth.users(id);

-- 3. Seuil de réussite quiz (« la moyenne ») configurable, défaut 50 %.
alter table public.organizations
  add column if not exists quiz_pass_threshold_percent integer not null default 50
    check (quiz_pass_threshold_percent between 0 and 100);

-- 4. Historique des tentatives remplacées (rejeu) — garde la trace du 1er essai.
create table if not exists public.quiz_attempt_history (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  enrollment_id     uuid not null references public.session_enrollments(id) on delete cascade,
  quiz_template_id  uuid not null references public.quiz_templates(id) on delete cascade,
  phase             text not null check (phase in ('pre','post')),
  score             integer,
  max_score         integer,
  data              jsonb,
  completed_at      timestamptz,
  reason            text not null default 'replay',
  archived_at       timestamptz not null default now(),
  archived_by       uuid references auth.users(id)
);

create index if not exists idx_quiz_attempt_history_enrollment
  on public.quiz_attempt_history(enrollment_id, quiz_template_id, phase);
create index if not exists idx_quiz_attempt_history_org
  on public.quiz_attempt_history(organization_id);

alter table public.quiz_attempt_history enable row level security;

drop policy if exists "quiz_attempt_history_select_org"
  on public.quiz_attempt_history;
create policy "quiz_attempt_history_select_org"
  on public.quiz_attempt_history for select
  using (public.is_org_member(organization_id));

drop policy if exists "quiz_attempt_history_insert_org"
  on public.quiz_attempt_history;
create policy "quiz_attempt_history_insert_org"
  on public.quiz_attempt_history for insert
  with check (public.is_org_member(organization_id));
