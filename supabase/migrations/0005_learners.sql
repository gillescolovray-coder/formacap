-- =========================================================
-- Migration 0005 : apprenants / stagiaires
-- =========================================================
-- Objectif : gérer les personnes formées (§6.5 cahier des charges).
-- Un apprenant peut être :
--   - rattaché à une entreprise cliente (formation pro B2B)
--   - ou indépendant / particulier (company_id NULL)
-- =========================================================

create table public.learners (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  -- Identité
  civility            text,           -- M., Mme, Autre
  first_name          text not null,
  last_name           text not null,
  birth_date          date,
  birth_place         text,

  -- Coordonnées personnelles
  email               text,
  phone               text,
  mobile              text,

  -- Adresse personnelle
  address             text,
  postal_code         text,
  city                text,
  country             text default 'France',

  -- Rattachement entreprise (optionnel — null = particulier)
  company_id          uuid references public.companies(id) on delete set null,
  job_title           text,

  -- Qualiopi
  special_needs       text,
  accessibility       text,

  -- Commercial / administratif
  lead_source         text,
  notes               text,

  is_active           boolean not null default true,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_learners_org      on public.learners(organization_id);
create index idx_learners_company  on public.learners(company_id);
create index idx_learners_name     on public.learners(organization_id, last_name, first_name);

create trigger learners_updated_at
  before update on public.learners
  for each row execute function public.set_updated_at();

comment on table public.learners is 'Apprenants / stagiaires';

-- RLS
alter table public.learners enable row level security;

create policy "learners_select_org"
  on public.learners for select
  using (public.is_org_member(organization_id));

create policy "learners_insert_authorized"
  on public.learners for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "learners_update_authorized"
  on public.learners for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "learners_delete_admin"
  on public.learners for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));
