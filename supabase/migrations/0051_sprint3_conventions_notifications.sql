-- =========================================================
-- Migration 0051 : Sprint 3 — Conventions, notifications inscription,
--                  attestations email
-- =========================================================
-- 1) Table session_conventions : 1 convention par couple session ×
--    entreprise (les apprenants d'une même entreprise sur une session
--    partagent la même convention).
--
-- 2) Tokens de signature de convention (pattern signature_links étendu)
--    → on réutilise la même table signature_links en ajoutant un type.
--
-- 3) Colonnes de tracking sur session_enrollments pour les emails
--    automatiques (inscription, attestation).
-- =========================================================

-- =========================================================
-- 1) session_conventions
-- =========================================================
create table public.session_conventions (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,

  -- Statut métier
  status          text not null default 'draft'
                    check (status in ('draft', 'sent', 'signed', 'cancelled')),

  -- Contact qui doit signer côté client (1 RH par convention)
  contact_id      uuid references public.company_contacts(id) on delete set null,
  contact_name    text,
  contact_email   text,

  -- Envoi
  sent_at         timestamptz,
  sent_to_email   text,

  -- Signature
  signed_at       timestamptz,
  signed_by_name  text,
  signed_ip       text,
  signed_user_agent text,
  signature_data  text,                   -- PNG base64 de la signature manuscrite

  -- PDF généré
  pdf_url         text,
  pdf_generated_at timestamptz,

  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Une seule convention active par couple session × entreprise
  unique (session_id, company_id)
);

create index idx_session_conventions_session on public.session_conventions(session_id);
create index idx_session_conventions_company on public.session_conventions(company_id);

comment on table public.session_conventions is
  'Conventions de formation (1 par couple session x entreprise cliente). Tracke envoi, signature et PDF generes.';

create trigger session_conventions_updated_at
  before update on public.session_conventions
  for each row execute function public.set_updated_at();

-- =========================================================
-- 2) Étendre signature_links pour supporter les conventions
-- =========================================================
-- On ajoute une colonne convention_id et on permet à enrollment_id d'être null.
alter table public.signature_links
  alter column enrollment_id drop not null;

alter table public.signature_links
  add column if not exists convention_id uuid
    references public.session_conventions(id) on delete cascade;

create index if not exists idx_signature_links_convention
  on public.signature_links(convention_id);

-- Contrainte : exactement un des deux (enrollment_id OU convention_id) doit
-- être renseigné (pas les deux, pas zéro).
alter table public.signature_links
  add constraint signature_links_target_exclusive
    check (
      (enrollment_id is not null and convention_id is null) or
      (enrollment_id is null and convention_id is not null)
    );

-- =========================================================
-- 3) RLS session_conventions
-- =========================================================
alter table public.session_conventions enable row level security;

-- SELECT (membre orga via session)
create policy "session_conventions_select_org"
  on public.session_conventions for select
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and public.is_org_member(s.organization_id)
  ));

-- INSERT / UPDATE / DELETE pour admin/manager/pedagogy_lead
create policy "session_conventions_insert_authorized"
  on public.session_conventions for insert
  with check (exists (
    select 1 from public.sessions s
    where s.id = session_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role)
    )
  ));

create policy "session_conventions_update_authorized"
  on public.session_conventions for update
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role)
    )
  ));

create policy "session_conventions_delete_authorized"
  on public.session_conventions for delete
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role)
    )
  ));

-- SELECT publique via token (signature)
create policy "session_conventions_select_via_signature_link"
  on public.session_conventions for select
  using (exists (
    select 1 from public.signature_links sl
    where sl.convention_id = id
      and sl.expires_at > now()
  ));

-- UPDATE publique pour marquer comme signée (via lien public)
create policy "session_conventions_update_sign_via_link"
  on public.session_conventions for update
  using (exists (
    select 1 from public.signature_links sl
    where sl.convention_id = id
      and sl.expires_at > now()
      and sl.used_at is null
  ));

-- =========================================================
-- 4) Tracking emails sur session_enrollments
-- =========================================================
alter table public.session_enrollments
  add column if not exists inscription_email_sent_at timestamptz,
  add column if not exists attestation_sent_at      timestamptz;

comment on column public.session_enrollments.inscription_email_sent_at is
  'Date d''envoi du mail de confirmation d''inscription a l''apprenant + RH (Sprint 3).';
comment on column public.session_enrollments.attestation_sent_at is
  'Date d''envoi par email de l''attestation de realisation a l''apprenant.';

-- =========================================================
-- 5) Étendre l'enum attendance_signatures pour conventions
-- =========================================================
-- Quand le RH signe la convention, on l'enregistre dans la table
-- session_conventions directement (champ signature_data). Pas besoin
-- d'étendre attendance_signatures.
