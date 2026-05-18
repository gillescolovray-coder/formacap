-- =========================================================
-- Migration 0080 : Tokens portail formateur
-- =========================================================
-- 1 token persistant par formateur (`trainers.id`). Permet à
-- chaque formateur d'accéder à son agenda et à ses sessions via
-- une URL unique `/formateur/<token>`, sans avoir besoin d'un
-- compte Supabase Auth (pattern identique aux apprenants).
--
-- Le token est généré à l'envoi de la 1ère convocation formateur
-- (au passage de session en statut "confirmed") ou à la 1ère
-- visite admin sur le formateur. Pas d'expiration.
-- =========================================================

create table if not exists public.trainer_portal_tokens (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null unique
                references public.trainers(id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);

create index if not exists idx_trainer_portal_tokens_token
  on public.trainer_portal_tokens(token);

comment on table public.trainer_portal_tokens is
  'Token persistant par formateur pour l''accès au portail /formateur/<token>. Migration 0080.';

-- ---------------------------------------------------------
-- RLS : SELECT public (token = authent), gestion par membres org
-- ---------------------------------------------------------
alter table public.trainer_portal_tokens enable row level security;

drop policy if exists "trainer_portal_tokens_select_public_via_token"
  on public.trainer_portal_tokens;
create policy "trainer_portal_tokens_select_public_via_token"
  on public.trainer_portal_tokens for select
  using (true);

drop policy if exists "trainer_portal_tokens_modify_authorized"
  on public.trainer_portal_tokens;
create policy "trainer_portal_tokens_modify_authorized"
  on public.trainer_portal_tokens for all
  using (
    exists (
      select 1 from public.trainers t
      where t.id = trainer_id and (
        public.has_org_role(t.organization_id, 'admin'::public.app_role) or
        public.has_org_role(t.organization_id, 'manager'::public.app_role) or
        public.has_org_role(t.organization_id, 'pedagogy_lead'::public.app_role)
      )
    )
  )
  with check (
    exists (
      select 1 from public.trainers t
      where t.id = trainer_id and (
        public.has_org_role(t.organization_id, 'admin'::public.app_role) or
        public.has_org_role(t.organization_id, 'manager'::public.app_role) or
        public.has_org_role(t.organization_id, 'pedagogy_lead'::public.app_role)
      )
    )
  );
