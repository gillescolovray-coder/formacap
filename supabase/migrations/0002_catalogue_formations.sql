-- =========================================================
-- Migration 0002 : catalogue des formations
-- =========================================================
-- Objectif : table "formations" couvrant les exigences §6.2
-- du cahier des charges (fiche formation Qualiopi).
-- =========================================================

-- Types enum
create type public.formation_modality as enum ('presentiel', 'distanciel', 'hybride');
create type public.formation_status   as enum ('draft', 'published', 'archived');

-- ---------------------------------------------------------
-- Table: formations
-- ---------------------------------------------------------
create table public.formations (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,

  -- Identification
  internal_code            text,
  title                    text not null,
  category                 text,
  description              text,  -- Resume court pour listing

  -- Pédagogie (Qualiopi §6.2)
  general_objective        text,
  operational_objectives   jsonb not null default '[]'::jsonb,  -- tableau de strings
  target_audience          text,
  prerequisites            text,
  program                  text,
  teaching_methods         text,
  technical_means          text,
  evaluation_methods       text,
  accessibility            text,

  -- Logistique
  duration_hours           numeric(6, 1),
  modality                 public.formation_modality,

  -- Commercial
  public_price_excl_tax    numeric(10, 2),
  vat_rate                 numeric(4, 2) default 20.00,

  -- Gestion
  version                  integer not null default 1,
  status                   public.formation_status not null default 'draft',

  created_by               uuid references public.profiles(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  unique (organization_id, internal_code)
);

create index idx_formations_org     on public.formations(organization_id);
create index idx_formations_status  on public.formations(status);

comment on table public.formations is 'Fiches formation du catalogue (CAP NUMERIQUE ou formateur proprietaire)';

-- ---------------------------------------------------------
-- Trigger: mise a jour automatique de updated_at
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger formations_updated_at
  before update on public.formations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.formations enable row level security;

-- SELECT : tout membre actif d'une orga voit ses formations
create policy "formations_select_org_members"
  on public.formations for select
  using (public.is_org_member(organization_id));

-- INSERT : admin / manager / pedagogy_lead / trainer peuvent creer
create policy "formations_insert_authorized"
  on public.formations for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role) or
    public.has_org_role(organization_id, 'trainer'::public.app_role)
  );

-- UPDATE : meme regle
create policy "formations_update_authorized"
  on public.formations for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role) or
    public.has_org_role(organization_id, 'trainer'::public.app_role)
  );

-- DELETE : reserve aux admins (les autres archivent via status)
create policy "formations_delete_admin"
  on public.formations for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));
