-- =========================================================
-- Migration 0107 : Tokens publics par SESSION pour le QUIZ.
-- =========================================================
-- Permet au formateur d'afficher UN SEUL QR code que les apprenants
-- scannent pour jouer le quiz pré / post — au lieu d'un QR par
-- apprenant. La page publique liste les inscrits, l'apprenant choisit
-- son nom, et il est redirigé vers son /mon-parcours/[token]/quiz
-- personnel (qui contient déjà l'anti-rejeu : 1 fois pre, 1 fois post).
--
-- Demande Gilles 2026-05-25 : "le code QR par participant n'est pas
-- pratique il faut afficher un seul code QR et l'apprenant sélectionne
-- son nom et prénom pour jouer le quiz d'entrée et de sortie".
--
-- Pendant exact de session_emargement_tokens (cf. migration 0075) et
-- session_evaluation_tokens : même structure, même politique RLS.
-- =========================================================

create table if not exists public.session_quiz_tokens (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (session_id, token)
);

create index if not exists idx_session_quiz_tokens_token
  on public.session_quiz_tokens(token);
create index if not exists idx_session_quiz_tokens_session
  on public.session_quiz_tokens(session_id);

comment on table public.session_quiz_tokens is
  'Tokens publics par session pour le QR code de quiz pré/post partagé. Migration 0107.';

alter table public.session_quiz_tokens enable row level security;

drop policy if exists "session_quiz_tokens_select_public_via_token"
  on public.session_quiz_tokens;
create policy "session_quiz_tokens_select_public_via_token"
  on public.session_quiz_tokens for select
  using (expires_at > now());

drop policy if exists "session_quiz_tokens_select_org"
  on public.session_quiz_tokens;
create policy "session_quiz_tokens_select_org"
  on public.session_quiz_tokens for select
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and public.is_org_member(s.organization_id)
    )
  );

drop policy if exists "session_quiz_tokens_modify_authorized"
  on public.session_quiz_tokens;
create policy "session_quiz_tokens_modify_authorized"
  on public.session_quiz_tokens for all
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
