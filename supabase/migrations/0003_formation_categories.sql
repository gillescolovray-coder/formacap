-- =========================================================
-- Migration 0003 : catégories de formations
-- =========================================================
-- Objectif : remplacer le champ texte libre "category" par une
-- liste gérée (table dédiée) pour homogénéité et filtrage propre.
-- Les catégories sont cloisonnées par organisation.
-- =========================================================

-- ---------------------------------------------------------
-- Table: formation_categories
-- ---------------------------------------------------------
create table public.formation_categories (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, name)
);

create index idx_formation_categories_org on public.formation_categories(organization_id);

create trigger formation_categories_updated_at
  before update on public.formation_categories
  for each row execute function public.set_updated_at();

comment on table public.formation_categories is 'Catégories (domaines) de formations, cloisonnées par organisation';

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.formation_categories enable row level security;

-- SELECT : tout membre actif d'une orga voit ses catégories
create policy "formation_categories_select_org_members"
  on public.formation_categories for select
  using (public.is_org_member(organization_id));

-- INSERT/UPDATE/DELETE : réservé aux administrateurs
create policy "formation_categories_insert_admin"
  on public.formation_categories for insert
  with check (public.has_org_role(organization_id, 'admin'::public.app_role));

create policy "formation_categories_update_admin"
  on public.formation_categories for update
  using (public.has_org_role(organization_id, 'admin'::public.app_role));

create policy "formation_categories_delete_admin"
  on public.formation_categories for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));

-- ---------------------------------------------------------
-- Modification de public.formations :
-- on remplace le champ texte par une FK vers formation_categories
-- ---------------------------------------------------------
alter table public.formations drop column category;
alter table public.formations
  add column category_id uuid references public.formation_categories(id) on delete set null;

create index idx_formations_category_id on public.formations(category_id);

-- ---------------------------------------------------------
-- Seed : quelques catégories par défaut pour CAP NUMÉRIQUE
-- ---------------------------------------------------------
insert into public.formation_categories (organization_id, name)
select o.id, c.name
from public.organizations o
cross join (
  values
    ('Bureautique'),
    ('Web & Digital'),
    ('Management'),
    ('Gestion')
) as c(name)
where o.slug = 'cap-numerique'
on conflict (organization_id, name) do nothing;
