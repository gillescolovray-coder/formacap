-- =========================================================
-- Migration 0116 : Portail Apprenant
-- =========================================================
-- Permet a un apprenant (learner) d acceder a un portail
-- personnel sur /apprenant/<token> ou il retrouve :
--   1) Ses sessions de formation (a venir + passees)
--   2) Ses documents telechargeables (attestation, programme,
--      convention en consultation)
--   3) Ses scores de quiz (pre + post + progression)
--
-- 1 token persistant par learner (peu importe le nombre de sessions).
-- Le token est envoye dans l email d attestation a la fin d une
-- formation, et reste valide indefiniment (preuve Qualiopi : traces
-- accessibles a posteriori).
-- =========================================================

create table if not exists public.learner_portal_tokens (
  id          uuid primary key default gen_random_uuid(),
  learner_id  uuid not null unique
                references public.learners(id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);

create index if not exists idx_learner_portal_tokens_token
  on public.learner_portal_tokens(token);

comment on table public.learner_portal_tokens is
  'Token personnel par apprenant pour l acces au portail /apprenant/<token>. Migration 0116.';

-- ---------------------------------------------------------
-- RLS : lecture publique (la possession du token vaut authent),
-- gestion par les membres de l organisation proprietaire du learner.
-- ---------------------------------------------------------
alter table public.learner_portal_tokens enable row level security;

drop policy if exists "learner_portal_tokens_select_public_via_token"
  on public.learner_portal_tokens;
create policy "learner_portal_tokens_select_public_via_token"
  on public.learner_portal_tokens for select
  using (true);

drop policy if exists "learner_portal_tokens_modify_authorized"
  on public.learner_portal_tokens;
create policy "learner_portal_tokens_modify_authorized"
  on public.learner_portal_tokens for all
  using (
    exists (
      select 1 from public.learners l
      where l.id = learner_id and (
        public.has_org_role(l.organization_id, 'admin'::public.app_role) or
        public.has_org_role(l.organization_id, 'manager'::public.app_role) or
        public.has_org_role(l.organization_id, 'pedagogy_lead'::public.app_role)
      )
    )
  )
  with check (
    exists (
      select 1 from public.learners l
      where l.id = learner_id and (
        public.has_org_role(l.organization_id, 'admin'::public.app_role) or
        public.has_org_role(l.organization_id, 'manager'::public.app_role) or
        public.has_org_role(l.organization_id, 'pedagogy_lead'::public.app_role)
      )
    )
  );
