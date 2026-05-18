-- =========================================================================
-- 0061 — Référents pédagogiques sur une inscription_request
--
-- Décision Gilles 2026-05-13 :
-- Sur chaque fiche d'inscription, on peut rattacher 0, 1 ou plusieurs
-- "référents pédagogiques" qui sont OBLIGATOIREMENT des contacts de
-- la société liée à l'apprenant. Ces référents reçoivent en CC les
-- emails de :
--   - Confirmation d'inscription
--   - Convocation
--   - Convention de formation
--   - Attestation de réalisation
--
-- Si l'inscription concerne un particulier (pas de société), le bloc
-- Référents n'est pas affiché (cf. UI).
-- =========================================================================

create table if not exists public.inscription_referent_contacts (
  inscription_id  uuid not null references public.inscription_requests(id)
    on delete cascade,
  contact_id      uuid not null references public.company_contacts(id)
    on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (inscription_id, contact_id)
);

create index if not exists idx_inscription_referent_contacts_inscription
  on public.inscription_referent_contacts(inscription_id);
create index if not exists idx_inscription_referent_contacts_contact
  on public.inscription_referent_contacts(contact_id);

comment on table public.inscription_referent_contacts is
  'Référents pédagogiques (contacts entreprise) rattachés à une inscription. Reçoivent en CC les emails (confirmation, convocation, convention, attestation). Migration 0061.';

-- ---------------------------------------------------------
-- RLS : un utilisateur peut lire/écrire les liaisons si l''inscription
-- appartient à son organisation.
-- ---------------------------------------------------------
alter table public.inscription_referent_contacts enable row level security;

drop policy if exists "inscription_referent_contacts_select_org"
  on public.inscription_referent_contacts;
create policy "inscription_referent_contacts_select_org"
  on public.inscription_referent_contacts for select
  using (
    exists (
      select 1 from public.inscription_requests r
      where r.id = inscription_id
        and public.is_org_member(r.organization_id)
    )
  );

drop policy if exists "inscription_referent_contacts_modify_org"
  on public.inscription_referent_contacts;
create policy "inscription_referent_contacts_modify_org"
  on public.inscription_referent_contacts for all
  using (
    exists (
      select 1 from public.inscription_requests r
      where r.id = inscription_id
        and (
          public.has_org_role(r.organization_id, 'admin'::public.app_role) or
          public.has_org_role(r.organization_id, 'manager'::public.app_role) or
          public.has_org_role(r.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  )
  with check (
    exists (
      select 1 from public.inscription_requests r
      where r.id = inscription_id
        and (
          public.has_org_role(r.organization_id, 'admin'::public.app_role) or
          public.has_org_role(r.organization_id, 'manager'::public.app_role) or
          public.has_org_role(r.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );
