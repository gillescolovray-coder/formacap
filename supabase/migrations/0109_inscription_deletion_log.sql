-- =========================================================
-- Migration 0109 : log d'audit des desinscriptions
-- =========================================================
-- Probleme : inscription_events est cascade-deleted quand on supprime
-- une inscription_request -> impossible de garder une trace des
-- suppressions dans cette table (l'event est supprime en meme temps
-- que la request).
--
-- Solution : table dediee inscription_deletion_log qui snapshot les
-- infos cles au moment de la suppression, sans aucune FK qui pourrait
-- la perdre.
--
-- Gilles 2026-05-28 : besoin d'un email quotidien recapitulant TOUTES
-- les inscriptions ET desinscriptions de la journee (admin + partenaire).
-- =========================================================

create table if not exists public.inscription_deletion_log (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  -- ID original de l'inscription_request (sans FK : la ligne est
  -- supprimee par definition).
  request_id         uuid not null,
  -- Snapshot des infos utiles au recap (nom, email, formation, date).
  learner_name       text,
  learner_email      text,
  company_name       text,
  session_id         uuid,
  session_start_date date,
  formation_title    text,
  -- Origine de la suppression :
  --   - 'admin'   : depuis /inscriptions/[id] (membre OF connecte)
  --   - 'partner' : depuis le portail partenaire
  --   - 'system'  : automatique (cascade, conversion, etc.)
  deleted_by_type    text not null check (deleted_by_type in ('admin', 'partner', 'system')),
  -- Acteur (membre OF) pour 'admin' / 'system' admin
  actor_profile_id   uuid references public.profiles(id) on delete set null,
  -- Entreprise partenaire pour 'partner'
  actor_partner_company_id uuid references public.companies(id) on delete set null,
  -- Raison optionnelle
  reason             text,
  deleted_at         timestamptz not null default now()
);

create index if not exists idx_inscription_deletion_log_org_date
  on public.inscription_deletion_log(organization_id, deleted_at desc);

comment on table public.inscription_deletion_log is
  'Audit des suppressions d''inscription_requests (snapshot car request supprimee). Migration 0109.';

-- RLS : lecture / insertion reservees aux membres de l''organisation
alter table public.inscription_deletion_log enable row level security;

drop policy if exists "ins_del_log_select_org" on public.inscription_deletion_log;
create policy "ins_del_log_select_org"
  on public.inscription_deletion_log for select
  using (public.is_org_member(organization_id));

drop policy if exists "ins_del_log_insert_org" on public.inscription_deletion_log;
create policy "ins_del_log_insert_org"
  on public.inscription_deletion_log for insert
  with check (public.is_org_member(organization_id));
