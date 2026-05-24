-- =========================================================
-- Migration 0104 : Sous-traitance — Apprenants temporaires
-- + token QR d'inscription rapide
-- =========================================================
-- Cas d'usage (Gilles 2026-05-24) :
-- Quand CAP NUMERIQUE est sous-traitant d'un OF, la liste des
-- apprenants n'est souvent connue que le JOUR J (l'OF donneur
-- d'ordre ne transmet rien en amont).
--
-- Phase 1 MVP :
--  1) Apprenant "temporaire" : flag is_temporary + entreprise
--     en texte libre directement sur learners (pas de fiche
--     companies créée à ce stade, validation/promotion en Phase 2).
--  2) Saisie express manuelle par l'utilisateur ou le formateur
--     (modal 6 champs).
--  3) Token QR d'inscription rapide : l'apprenant scanne, remplit
--     un mini-formulaire, est redirigé direct sur le quiz pré-form.
--
-- Filtrage : les apprenants is_temporary doivent être masqués
-- des listes Apprenants / Entreprises tant que non validés.
-- =========================================================

-- ---------------------------------------------------------
-- 1) learners : flag temporaire + entreprise en texte libre
-- ---------------------------------------------------------
alter table public.learners
  add column if not exists is_temporary       boolean not null default false,
  add column if not exists company_name_temp  text,
  add column if not exists company_siret_temp text;

comment on column public.learners.is_temporary is
  'Apprenant créé en saisie express le jour J (sous-traitance). À promouvoir vers fiche définitive en fin de session. Migration 0104.';
comment on column public.learners.company_name_temp is
  'Nom de société en texte libre (pas de fiche companies créée à ce stade). Utilisé quand is_temporary=true.';
comment on column public.learners.company_siret_temp is
  'SIRET en texte libre, optionnel. Servira à la déduplication lors de la promotion.';

create index if not exists idx_learners_is_temporary
  on public.learners(organization_id, is_temporary)
  where is_temporary = true;

-- ---------------------------------------------------------
-- 2) Tokens QR d'inscription rapide (1 token actif par session)
-- ---------------------------------------------------------
create table if not exists public.session_quick_signup_tokens (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (session_id, token)
);

create index if not exists idx_session_quick_signup_tokens_token
  on public.session_quick_signup_tokens(token);
create index if not exists idx_session_quick_signup_tokens_session
  on public.session_quick_signup_tokens(session_id);

comment on table public.session_quick_signup_tokens is
  'Tokens publics par session pour le QR d''inscription rapide (sous-traitance, jour J). L''apprenant remplit un formulaire puis est redirigé vers le quiz. Migration 0104.';

-- RLS : même pattern que session_emargement_tokens (0075)
alter table public.session_quick_signup_tokens enable row level security;

-- Lecture publique tant que non expiré (la possession du token vaut authent)
drop policy if exists "session_quick_signup_tokens_select_public_via_token"
  on public.session_quick_signup_tokens;
create policy "session_quick_signup_tokens_select_public_via_token"
  on public.session_quick_signup_tokens for select
  using (expires_at > now());

-- Lecture par les membres de l'organisation de la session
drop policy if exists "session_quick_signup_tokens_select_org"
  on public.session_quick_signup_tokens;
create policy "session_quick_signup_tokens_select_org"
  on public.session_quick_signup_tokens for select
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and public.is_org_member(s.organization_id)
    )
  );

-- Création / modification : admin, manager, pedagogy_lead, trainer
drop policy if exists "session_quick_signup_tokens_modify_authorized"
  on public.session_quick_signup_tokens;
create policy "session_quick_signup_tokens_modify_authorized"
  on public.session_quick_signup_tokens for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and (
        public.has_org_role(s.organization_id, 'admin'::public.app_role) or
        public.has_org_role(s.organization_id, 'manager'::public.app_role) or
        public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role) or
        public.has_org_role(s.organization_id, 'trainer'::public.app_role)
      )
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and (
        public.has_org_role(s.organization_id, 'admin'::public.app_role) or
        public.has_org_role(s.organization_id, 'manager'::public.app_role) or
        public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role) or
        public.has_org_role(s.organization_id, 'trainer'::public.app_role)
      )
    )
  );
