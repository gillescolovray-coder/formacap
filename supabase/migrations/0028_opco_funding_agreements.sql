-- =========================================================
-- Migration 0028 : accords de financement OPCO
-- =========================================================
-- Objectif : centraliser les accords de prise en charge
-- envoyés par les OPCO (Constructys, OCAPIAT, AKTO…) et les
-- rattacher à une ou plusieurs demandes d'inscription.
-- =========================================================

create table public.opco_funding_agreements (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  -- Identification
  opco_name        text not null,           -- Constructys, OCAPIAT, AFDAS…
  dossier_number   text,                    -- N/Réf. ou identifiant dossier OPCO
  agreement_date   date,                    -- Date du courrier d'accord

  -- Montant total HT couvert par l'accord
  total_amount_ht  numeric(12,2),

  -- Document scanné
  pdf_url          text,                    -- URL Drive (ou autre stockage)
  pdf_filename     text,                    -- Nom original (pour réaffichage)

  -- Notes libres
  notes            text,

  -- Gestion
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_opco_funding_agreements_org
  on public.opco_funding_agreements(organization_id);
create index idx_opco_funding_agreements_dossier
  on public.opco_funding_agreements(organization_id, dossier_number);

drop trigger if exists opco_funding_agreements_updated_at
  on public.opco_funding_agreements;
create trigger opco_funding_agreements_updated_at
  before update on public.opco_funding_agreements
  for each row execute function public.set_updated_at();

comment on table public.opco_funding_agreements is
  'Accords de prise en charge OPCO (un PDF déposé = un accord, lié à 1..n inscriptions)';

-- ---------------------------------------------------------
-- Table de liaison N-N : inscription_requests <-> opco_funding_agreements
-- ---------------------------------------------------------
create table public.inscription_opco_fundings (
  agreement_id     uuid not null references public.opco_funding_agreements(id) on delete cascade,
  inscription_id   uuid not null references public.inscription_requests(id) on delete cascade,
  amount_ht        numeric(12,2),  -- Part du montant total allouée à cet apprenant
  created_at       timestamptz not null default now(),

  primary key (agreement_id, inscription_id)
);

create index idx_inscription_opco_fundings_inscription
  on public.inscription_opco_fundings(inscription_id);

comment on table public.inscription_opco_fundings is
  'Lien N-N entre demandes d''inscription et accords de financement OPCO. amount_ht permet de répartir le total entre apprenants.';

-- ---------------------------------------------------------
-- RLS : opco_funding_agreements
-- ---------------------------------------------------------
alter table public.opco_funding_agreements enable row level security;

create policy "opco_agreements_select_org"
  on public.opco_funding_agreements for select
  using (public.is_org_member(organization_id));

create policy "opco_agreements_insert_authorized"
  on public.opco_funding_agreements for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "opco_agreements_update_authorized"
  on public.opco_funding_agreements for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "opco_agreements_delete_admin"
  on public.opco_funding_agreements for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));

-- ---------------------------------------------------------
-- RLS : inscription_opco_fundings (cascade via l'accord)
-- ---------------------------------------------------------
alter table public.inscription_opco_fundings enable row level security;

create policy "iof_select_org"
  on public.inscription_opco_fundings for select
  using (
    exists (
      select 1 from public.opco_funding_agreements a
      where a.id = agreement_id
        and public.is_org_member(a.organization_id)
    )
  );

create policy "iof_insert_authorized"
  on public.inscription_opco_fundings for insert
  with check (
    exists (
      select 1 from public.opco_funding_agreements a
      where a.id = agreement_id
        and (
          public.has_org_role(a.organization_id, 'admin'::public.app_role) or
          public.has_org_role(a.organization_id, 'manager'::public.app_role) or
          public.has_org_role(a.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );

create policy "iof_update_authorized"
  on public.inscription_opco_fundings for update
  using (
    exists (
      select 1 from public.opco_funding_agreements a
      where a.id = agreement_id
        and (
          public.has_org_role(a.organization_id, 'admin'::public.app_role) or
          public.has_org_role(a.organization_id, 'manager'::public.app_role) or
          public.has_org_role(a.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );

create policy "iof_delete_authorized"
  on public.inscription_opco_fundings for delete
  using (
    exists (
      select 1 from public.opco_funding_agreements a
      where a.id = agreement_id
        and (
          public.has_org_role(a.organization_id, 'admin'::public.app_role) or
          public.has_org_role(a.organization_id, 'manager'::public.app_role) or
          public.has_org_role(a.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );
