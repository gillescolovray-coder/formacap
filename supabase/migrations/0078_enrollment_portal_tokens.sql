-- =========================================================
-- Migration 0078 : Portail apprenant personnel par enrollment
-- =========================================================
-- 1 token par inscription (apprenant × session). Le QR code et le
-- lien "Cliquez ici" sur la convocation pointent vers
-- /parcours/<token>. L'apprenant y trouve toutes ses ressources
-- (test positionnement, émargement, supports, évaluation,
-- certificat), chacune activée selon des règles temporelles.
--
-- Token persistant, créé une fois pour toute à l'envoi de la
-- convocation (ou lazily à la 1ère génération du PDF). Pas
-- d'expiration : la session reste consultable a posteriori
-- (preuve Qualiopi).
-- =========================================================

create table if not exists public.enrollment_portal_tokens (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique
                  references public.session_enrollments(id) on delete cascade,
  token         text not null unique,
  created_at    timestamptz not null default now()
);

create index if not exists idx_enrollment_portal_tokens_token
  on public.enrollment_portal_tokens(token);

comment on table public.enrollment_portal_tokens is
  'Token personnel par inscription pour le portail apprenant (QR sur convocation). Migration 0078.';

-- ---------------------------------------------------------
-- RLS : lecture publique (la possession du token vaut authent),
-- gestion par les membres de l'organisation.
-- ---------------------------------------------------------
alter table public.enrollment_portal_tokens enable row level security;

drop policy if exists "enrollment_portal_tokens_select_public_via_token"
  on public.enrollment_portal_tokens;
create policy "enrollment_portal_tokens_select_public_via_token"
  on public.enrollment_portal_tokens for select
  using (true);

drop policy if exists "enrollment_portal_tokens_modify_authorized"
  on public.enrollment_portal_tokens;
create policy "enrollment_portal_tokens_modify_authorized"
  on public.enrollment_portal_tokens for all
  using (
    exists (
      select 1
      from public.session_enrollments e
      join public.sessions s on s.id = e.session_id
      where e.id = enrollment_id and (
        public.has_org_role(s.organization_id, 'admin'::public.app_role) or
        public.has_org_role(s.organization_id, 'manager'::public.app_role) or
        public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role) or
        public.has_org_role(s.organization_id, 'trainer'::public.app_role)
      )
    )
  )
  with check (
    exists (
      select 1
      from public.session_enrollments e
      join public.sessions s on s.id = e.session_id
      where e.id = enrollment_id and (
        public.has_org_role(s.organization_id, 'admin'::public.app_role) or
        public.has_org_role(s.organization_id, 'manager'::public.app_role) or
        public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role) or
        public.has_org_role(s.organization_id, 'trainer'::public.app_role)
      )
    )
  );
