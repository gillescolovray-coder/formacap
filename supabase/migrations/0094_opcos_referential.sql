-- ============================================================
-- Référentiel des OPCO (Opérateurs de Compétences)
-- Gilles 2026-05-21
--
-- Permet à l'utilisateur de gérer la liste des OPCO français
-- (les 11 nationaux + ajouts éventuels) avec :
--   - Adresse, téléphone, email
--   - Portail Web (pour aller récupérer la PEC en ligne)
--   - Secteurs principaux
--   - Possibilité d'ajouter/modifier/supprimer
--
-- Sera utilisé dans le formulaire d'inscription quand le mode de
-- financement = "opco" : l'utilisateur choisit l'OPCO dans la liste
-- déroulante (triée alphabétiquement) + lien direct vers le portail.
-- ============================================================

create table if not exists public.opcos (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  sectors       text,
  address       text,
  phone         text,
  email         text,
  portal_url    text,
  is_active     boolean not null default true,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_opcos_organization on public.opcos(organization_id);
create index if not exists idx_opcos_active on public.opcos(organization_id, is_active);

-- Unicité du nom par organisation (évite les doublons)
create unique index if not exists uniq_opcos_name_per_org
  on public.opcos(organization_id, lower(name));

-- Trigger updated_at
create or replace function public.trg_opcos_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_opcos_updated_at on public.opcos;
create trigger trg_opcos_updated_at
  before update on public.opcos
  for each row execute function public.trg_opcos_set_updated_at();

-- RLS : isolation par organisation
alter table public.opcos enable row level security;

drop policy if exists "opcos_select_own_org" on public.opcos;
create policy "opcos_select_own_org" on public.opcos
  for select using (
    organization_id in (
      select organization_id from public.organization_members
      where profile_id = auth.uid() and is_active = true
    )
  );

drop policy if exists "opcos_insert_own_org" on public.opcos;
create policy "opcos_insert_own_org" on public.opcos
  for insert with check (
    organization_id in (
      select organization_id from public.organization_members
      where profile_id = auth.uid() and is_active = true
    )
  );

drop policy if exists "opcos_update_own_org" on public.opcos;
create policy "opcos_update_own_org" on public.opcos
  for update using (
    organization_id in (
      select organization_id from public.organization_members
      where profile_id = auth.uid() and is_active = true
    )
  );

drop policy if exists "opcos_delete_own_org" on public.opcos;
create policy "opcos_delete_own_org" on public.opcos
  for delete using (
    organization_id in (
      select organization_id from public.organization_members
      where profile_id = auth.uid() and is_active = true
    )
  );

-- ============================================================
-- Seed des 11 OPCO français pour TOUTES les organisations existantes.
-- Source : Centre Inffo (annexe officielle des 11 opérateurs de
-- compétences agréés par l'État).
--
-- Note : si une organisation a déjà créé un OPCO avec le même nom,
-- l'insertion sera ignorée (uniq index).
-- ============================================================

do $$
declare
  org_id uuid;
  opco_data record;
begin
  for org_id in select id from public.organizations loop
    for opco_data in
      select * from (values
        ('AFDAS',
         'Culture, médias, communication, sport, loisirs, spectacle',
         '66 rue Stendhal, CS 32016, 75990 Paris Cedex 20',
         '01 44 78 39 39',
         null,
         'https://www.afdas.com/'),
        ('AKTO',
         'Services à forte intensité de main-d''œuvre : intérim, propreté, sécurité, restauration, organismes de formation',
         '14 rue Riquet, 75940 Paris Cedex 19',
         '01 88 13 10 00',
         null,
         'https://www.akto.fr/'),
        ('ATLAS',
         'Banque, assurance, conseil, ingénierie, numérique, expertise comptable',
         '25 quai Panhard et Levassor, 75013 Paris',
         '01 43 46 01 10',
         null,
         'https://www.opco-atlas.fr/'),
        ('Constructys',
         'Bâtiment, travaux publics, négoce matériaux et bois',
         '32 rue René Boulanger, CS 60033, 75483 Paris',
         '01 82 83 95 00',
         null,
         'https://www.constructys.fr/'),
        ('OCAPIAT',
         'Agriculture, pêche, agroalimentaire, coopération agricole, territoires',
         '153 rue de la Pompe, CS 60742, 75179 Paris Cedex 16',
         '01 70 38 38 38',
         'support@ocapiat.fr',
         'https://www.ocapiat.fr/'),
        ('OPCO 2i',
         'Industries chimiques, pharmaceutiques, métallurgie, papier-carton, plasturgie',
         '23-25 rue Balzac, 75008 Paris',
         '08 05 69 03 57',
         null,
         'https://www.opco2i.fr/'),
        ('OPCO EP',
         'Entreprises de proximité, artisanat, professions libérales, commerces et services de proximité',
         '4 rue du Colonel-Driant, 75002 Paris',
         '09 70 83 88 37',
         null,
         'https://www.opcoep.fr/'),
        ('OPCO Mobilités',
         'Transport routier, maritime, ferroviaire, services automobiles, agences de voyages',
         '204 rond-point du Pont de Sèvres, 92100 Boulogne-Billancourt',
         '01 53 91 34 34',
         null,
         'https://www.opcomobilites.fr/'),
        ('OPCO Santé',
         'Santé, médico-social, social privé, hospitalisation privée',
         '31 rue Anatole France, 92300 Levallois-Perret',
         '01 49 68 10 10',
         null,
         'https://www.opco-sante.fr/'),
        ('Opcommerce',
         'Commerce de détail, commerce de gros, distribution',
         '251 boulevard Pereire, 75852 Paris Cedex 17',
         '01 55 37 41 51',
         null,
         'https://www.lopcommerce.com/'),
        ('Uniformation',
         'Cohésion sociale, aide à domicile, insertion, logement social, protection sociale',
         '43 boulevard Diderot, 75012 Paris',
         '01 53 02 13 13',
         null,
         'https://www.uniformation.fr/')
      ) as t(name, sectors, address, phone, email, portal_url)
    loop
      insert into public.opcos (organization_id, name, sectors, address, phone, email, portal_url)
      values (org_id, opco_data.name, opco_data.sectors, opco_data.address,
              opco_data.phone, opco_data.email, opco_data.portal_url)
      on conflict (organization_id, lower(name)) do nothing;
    end loop;
  end loop;
end $$;
