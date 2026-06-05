-- =========================================================
-- Migration 0121 : Traçabilité des accès au portail apprenant
-- =========================================================
-- Enregistre chaque "venue" d'un apprenant sur son espace personnel.
-- Throttle applicatif : au plus 1 ligne par apprenant et par tranche de
-- 30 min (cf. lib/portal/log-visit.ts) -> reflète les venues réelles.
-- Sert au widget tableau de bord "Accès à l'espace apprenant"
-- (par mois / par année).
-- =========================================================

create table if not exists public.learner_portal_visits (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  learner_id       uuid not null references public.learners(id) on delete cascade,
  visited_at       timestamptz not null default now()
);

create index if not exists idx_lpv_org_date
  on public.learner_portal_visits(organization_id, visited_at);
create index if not exists idx_lpv_learner_date
  on public.learner_portal_visits(learner_id, visited_at);

comment on table public.learner_portal_visits is
  'Journal des accès des apprenants à leur portail (1 ligne / apprenant / 30 min). Migration 0121.';

-- RLS : lecture réservée aux membres de l'organisation (tableau de bord).
-- L'insertion se fait via le client service_role du portail (bypass RLS) :
-- pas de policy d'insertion publique.
alter table public.learner_portal_visits enable row level security;

drop policy if exists "lpv_select_org" on public.learner_portal_visits;
create policy "lpv_select_org"
  on public.learner_portal_visits for select
  using (public.is_org_member(organization_id));
