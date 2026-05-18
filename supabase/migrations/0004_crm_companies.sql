-- =========================================================
-- Migration 0004 : CRM - entreprises et contacts
-- =========================================================
-- Objectif : couvrir le module CRM (§6.1 cahier des charges)
-- Entreprises clientes/prospects/prescripteurs/financeurs +
-- contacts rattachés à chaque entreprise.
-- =========================================================

-- Type enum : rôle commercial de l'entité
create type public.company_type as enum (
  'prospect',
  'client',
  'prescripteur',
  'financeur'
);

-- ---------------------------------------------------------
-- Table: companies
-- ---------------------------------------------------------
create table public.companies (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  -- Identification
  name             text not null,   -- raison sociale
  legal_form       text,            -- SARL, SAS, SA, EI...
  siret            text,
  nda              text,            -- pour les OF clients (num déclaration activité)
  industry         text,            -- secteur d'activité

  -- Commercial
  type             public.company_type not null default 'prospect',
  lead_source      text,            -- origine du lead

  -- Adresse
  address          text,
  postal_code      text,
  city             text,
  country          text default 'France',

  -- Contact général
  email            text,
  phone            text,
  website          text,

  -- Notes libres
  notes            text,

  -- Gestion
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_companies_org   on public.companies(organization_id);
create index idx_companies_type  on public.companies(type);
create index idx_companies_name  on public.companies(organization_id, name);

create trigger companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

comment on table public.companies is 'Entreprises : prospects, clients, prescripteurs, financeurs';

-- ---------------------------------------------------------
-- Table: company_contacts
-- ---------------------------------------------------------
create table public.company_contacts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,

  first_name   text,
  last_name    text not null,
  job_title    text,
  email        text,
  phone        text,
  mobile       text,
  notes        text,
  is_primary   boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_company_contacts_company on public.company_contacts(company_id);

create trigger company_contacts_updated_at
  before update on public.company_contacts
  for each row execute function public.set_updated_at();

comment on table public.company_contacts is 'Contacts rattachés à une entreprise';

-- ---------------------------------------------------------
-- RLS : companies
-- ---------------------------------------------------------
alter table public.companies enable row level security;

create policy "companies_select_org"
  on public.companies for select
  using (public.is_org_member(organization_id));

create policy "companies_insert_authorized"
  on public.companies for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "companies_update_authorized"
  on public.companies for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "companies_delete_admin"
  on public.companies for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));

-- ---------------------------------------------------------
-- RLS : company_contacts (cascade via l'entreprise)
-- ---------------------------------------------------------
alter table public.company_contacts enable row level security;

create policy "company_contacts_select_org"
  on public.company_contacts for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and public.is_org_member(c.organization_id)
    )
  );

create policy "company_contacts_insert_authorized"
  on public.company_contacts for insert
  with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and (
          public.has_org_role(c.organization_id, 'admin'::public.app_role) or
          public.has_org_role(c.organization_id, 'manager'::public.app_role) or
          public.has_org_role(c.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );

create policy "company_contacts_update_authorized"
  on public.company_contacts for update
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and (
          public.has_org_role(c.organization_id, 'admin'::public.app_role) or
          public.has_org_role(c.organization_id, 'manager'::public.app_role) or
          public.has_org_role(c.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );

create policy "company_contacts_delete_authorized"
  on public.company_contacts for delete
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and (
          public.has_org_role(c.organization_id, 'admin'::public.app_role) or
          public.has_org_role(c.organization_id, 'manager'::public.app_role) or
          public.has_org_role(c.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );
