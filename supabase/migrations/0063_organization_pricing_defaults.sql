-- =========================================================================
-- 0063 — Paramètres de tarification par défaut au niveau organisation
--
-- Décision Gilles 2026-05-14, règle métier R7 (cf. memory/
-- project_business_rules.md). Chaque organisation possède 6 tarifs
-- par défaut qui servent de base à toutes ses sessions :
--
--   • INTER  Présentiel : 340 € HT / J / apprenant
--   • INTER  Distanciel : 305 € HT / J / apprenant
--   • INTRA  Présentiel : 1250 € HT/J forfait (1→4 apprenants)
--                        + 175 € HT/J/apprenant supplémentaire
--   • INTRA  Distanciel : 990 € HT/J forfait (1→4 apprenants)
--                        + 150 € HT/J/apprenant supplémentaire
--
-- Le seuil forfait INTRA (4 par défaut) est lui aussi paramétrable.
-- =========================================================================

create table if not exists public.organization_pricing_defaults (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,

  -- INTER : prix par jour par apprenant
  inter_presentiel_per_day_ht       numeric(10,2) not null default 340.00,
  inter_distanciel_per_day_ht       numeric(10,2) not null default 305.00,

  -- INTRA : forfait jour + supplément par apprenant au-delà du seuil
  intra_presentiel_forfait_ht       numeric(10,2) not null default 1250.00,
  intra_presentiel_extra_per_day_ht numeric(10,2) not null default 175.00,
  intra_distanciel_forfait_ht       numeric(10,2) not null default 990.00,
  intra_distanciel_extra_per_day_ht numeric(10,2) not null default 150.00,

  -- Seuil du forfait INTRA (4 = forfait s'applique de 1 à 4 apprenants,
  -- à partir du 5ème on facture le supplément par apprenant).
  intra_forfait_threshold           integer       not null default 4
    check (intra_forfait_threshold >= 1),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.organization_pricing_defaults is
  'Tarifs par défaut de l''organisation (R7 — Gilles 2026-05-14). Hérités par les formations et sessions. Migration 0063.';

drop trigger if exists organization_pricing_defaults_updated_at
  on public.organization_pricing_defaults;
create trigger organization_pricing_defaults_updated_at
  before update on public.organization_pricing_defaults
  for each row execute function public.set_updated_at();

-- Auto-création d'une ligne par défaut pour chaque organisation
-- existante. Les nouvelles orgs auront leur ligne créée à l'inscription
-- (à gérer côté app lors de la création d'une org).
insert into public.organization_pricing_defaults (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.organization_pricing_defaults enable row level security;

drop policy if exists "org_pricing_defaults_select"
  on public.organization_pricing_defaults;
create policy "org_pricing_defaults_select"
  on public.organization_pricing_defaults for select
  using (public.is_org_member(organization_id));

drop policy if exists "org_pricing_defaults_modify"
  on public.organization_pricing_defaults;
create policy "org_pricing_defaults_modify"
  on public.organization_pricing_defaults for all
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role)
  )
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role)
  );
