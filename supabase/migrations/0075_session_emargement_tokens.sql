-- =========================================================
-- Migration 0075 : Tokens d'émargement publics par SESSION.
-- =========================================================
-- Permet au formateur d'afficher un QR code pendant la session :
-- chaque apprenant scanne, ouvre la page publique correspondante,
-- choisit son nom dans la liste, puis signe matin/après-midi.
--
-- Différent de signature_links (qui est par enrollment, envoyé par email) :
-- ici un SEUL token couvre TOUTE la session — l'apprenant choisit ensuite
-- son identité dans la liste de la session.
--
-- Sécurité : token random 32 bytes hex, non guessable. Expiration
-- configurable (par défaut = fin de session + 7 jours).
-- =========================================================

create table if not exists public.session_emargement_tokens (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Au plus 1 token actif par session (les anciens peuvent rester pour
  -- archive mais sont expirés)
  unique (session_id, token)
);

create index if not exists idx_session_emargement_tokens_token
  on public.session_emargement_tokens(token);
create index if not exists idx_session_emargement_tokens_session
  on public.session_emargement_tokens(session_id);

comment on table public.session_emargement_tokens is
  'Tokens publics par session pour le QR code d''émargement. Migration 0075.';

-- ---------------------------------------------------------
-- RLS : un membre de l''organisation peut créer/lire/modifier les
-- tokens de ses sessions. La PAGE PUBLIQUE elle, n''utilise pas RLS
-- (elle requête via service role ou route handler sans auth) — la
-- vérification du token vaut authentification.
-- ---------------------------------------------------------
alter table public.session_emargement_tokens enable row level security;

-- SELECT PUBLIC via token : un visiteur anonyme peut lire son token
-- tant qu'il n'est pas expiré (la page publique vérifie aussi côté
-- applicatif). Identique au pattern signature_links (cf. 0050).
drop policy if exists "session_emargement_tokens_select_public_via_token"
  on public.session_emargement_tokens;
create policy "session_emargement_tokens_select_public_via_token"
  on public.session_emargement_tokens for select
  using (expires_at > now());

drop policy if exists "session_emargement_tokens_select_org"
  on public.session_emargement_tokens;
create policy "session_emargement_tokens_select_org"
  on public.session_emargement_tokens for select
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id and public.is_org_member(s.organization_id)
    )
  );

drop policy if exists "session_emargement_tokens_modify_authorized"
  on public.session_emargement_tokens;
create policy "session_emargement_tokens_modify_authorized"
  on public.session_emargement_tokens for all
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
