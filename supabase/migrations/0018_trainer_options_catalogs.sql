-- =========================================================
-- Migration 0018 : Catalogues "publics visés" et "modalités"
-- + intervention nationale
-- =========================================================

alter table public.trainers
  add column if not exists intervention_nationwide boolean not null default false;

comment on column public.trainers.intervention_nationwide is
  'Si true, le formateur intervient sur tout le territoire (France entière).';

-- ---------------------------------------------------------
-- Catalogue : audiences (publics visés)
-- ---------------------------------------------------------
create table if not exists public.audience_catalog (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  position        int  not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index if not exists idx_audience_catalog_org
  on public.audience_catalog(organization_id, is_active, position);
drop trigger if exists audience_catalog_updated_at on public.audience_catalog;
create trigger audience_catalog_updated_at
  before update on public.audience_catalog
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Catalogue : modalités d'animation
-- ---------------------------------------------------------
create table if not exists public.modality_catalog (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  position        int  not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index if not exists idx_modality_catalog_org
  on public.modality_catalog(organization_id, is_active, position);
drop trigger if exists modality_catalog_updated_at on public.modality_catalog;
create trigger modality_catalog_updated_at
  before update on public.modality_catalog
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.audience_catalog enable row level security;
drop policy if exists "audience_catalog_select_org" on public.audience_catalog;
create policy "audience_catalog_select_org"
  on public.audience_catalog for select
  using (public.is_org_member(organization_id));
drop policy if exists "audience_catalog_modify" on public.audience_catalog;
create policy "audience_catalog_modify"
  on public.audience_catalog for all
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  )
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

alter table public.modality_catalog enable row level security;
drop policy if exists "modality_catalog_select_org" on public.modality_catalog;
create policy "modality_catalog_select_org"
  on public.modality_catalog for select
  using (public.is_org_member(organization_id));
drop policy if exists "modality_catalog_modify" on public.modality_catalog;
create policy "modality_catalog_modify"
  on public.modality_catalog for all
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  )
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

-- ---------------------------------------------------------
-- Pré-remplissage : audiences
-- ---------------------------------------------------------
insert into public.audience_catalog (organization_id, name, position)
select o.id, v.name, v.position
from public.organizations o
cross join (values
  ('Demandeurs d''emploi',   10),
  ('Salariés',               20),
  ('Dirigeants / cadres',    30),
  ('Indépendants',           40),
  ('Apprentis / étudiants',  50),
  ('Particuliers',           60),
  ('Élus / agents publics',  70)
) as v(name, position)
where not exists (
  select 1 from public.audience_catalog c
  where c.organization_id = o.id and c.name = v.name
);

-- ---------------------------------------------------------
-- Pré-remplissage : modalités
-- ---------------------------------------------------------
insert into public.modality_catalog (organization_id, name, position)
select o.id, v.name, v.position
from public.organizations o
cross join (values
  ('Présentiel',         10),
  ('Distanciel',         20),
  ('Hybride',            30),
  ('Inter-entreprises',  40),
  ('Intra-entreprise',   50),
  ('Coaching individuel',60)
) as v(name, position)
where not exists (
  select 1 from public.modality_catalog c
  where c.organization_id = o.id and c.name = v.name
);
