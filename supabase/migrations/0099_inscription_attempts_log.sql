-- ============================================================
-- Migration 0099 : journal d'audit des tentatives d'inscription
-- Gilles 2026-05-22
--
-- Objectif : tracer CHAQUE tentative d'inscription (réussie ou
-- échouée) soumise via la pré-inscription publique ou le portail
-- partenaire. Permet de :
--   1. Diagnostiquer les inscriptions perdues (échec INSERT silencieux,
--      contrainte unique violée, payload invalide, etc.)
--   2. Voir le payload exact reçu par le serveur (utile si bug formulaire)
--   3. Retrouver l'IP/UA pour identifier la source en cas de fraude
--
-- Use case déclencheur : 2026-05-22, FFB 03 a inscrit 3+1+1+1+1=7 personnes
-- mais on n'en voit que 4 (Quentin, Anaïs, Sandra, Tiphaine). Sans
-- log d'audit on ne peut pas savoir ce qui a échoué.
-- ============================================================

create table if not exists public.inscription_attempts_log (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid references public.organizations(id) on delete set null,
  -- Société partenaire (OF ou prescripteur) qui a soumis la demande.
  referrer_company_id   uuid references public.companies(id) on delete set null,
  attempted_at          timestamptz not null default now(),
  -- Source de la tentative pour pouvoir filtrer (pre-inscription publique
  -- vs portail partenaire authentifié, single vs batch).
  source                text not null,
  target_session_id     uuid,
  -- Payload exact reçu par le serveur (JSON), avec emails et noms
  -- (utile pour reconstituer une inscription manquante).
  payload               jsonb,
  success               boolean not null default false,
  -- IDs des inscription_requests créées (si succès partiel ou total).
  created_request_ids   text[],
  -- Message d'erreur synthétique (pour rapport rapide).
  error_message         text,
  -- Détails techniques (code Postgres, contrainte violée, etc.).
  error_details         jsonb,
  -- Identification client pour audit.
  client_ip             text,
  user_agent            text
);

create index if not exists idx_inscription_attempts_log_attempted_at
  on public.inscription_attempts_log(attempted_at desc);
create index if not exists idx_inscription_attempts_log_referrer
  on public.inscription_attempts_log(referrer_company_id);
create index if not exists idx_inscription_attempts_log_success
  on public.inscription_attempts_log(success)
  where success = false;

comment on table public.inscription_attempts_log is
  'Journal d''audit des tentatives d''inscription (pre-inscription publique + portail partenaire). Permet de diagnostiquer les echecs silencieux.';

-- ---------------------------------------------------------
-- RLS : lecture par membres de l'organisation (ou null pour fallback
-- diagnostic admin). INSERT seulement via service_role (le serveur).
-- ---------------------------------------------------------
alter table public.inscription_attempts_log enable row level security;

drop policy if exists "inscription_attempts_log_select_org"
  on public.inscription_attempts_log;
create policy "inscription_attempts_log_select_org"
  on public.inscription_attempts_log for select
  using (
    organization_id is null or public.is_org_member(organization_id)
  );
