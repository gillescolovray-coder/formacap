-- =========================================================
-- Migration 0049 : Catalogue de vente en ligne
-- =========================================================
-- Objectif : permettre à un organisme de formation de publier
-- un catalogue commercial en ligne (URL publique de type /c/[slug])
-- consultable et téléchargeable en PDF, alimenté en temps réel
-- par les fiches formation marquées is_published_online = true.
--
-- 1 ligne par organisation (uniq sur organization_id).
-- =========================================================

-- ---------------------------------------------------------
-- Table: catalog
-- ---------------------------------------------------------
create table public.catalog (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null unique references public.organizations(id) on delete cascade,

  -- Publication
  slug              text not null unique,
  is_published     boolean not null default false,
  published_at     timestamptz,

  -- Apparence (charte graphique)
  cover_image_url   text,
  hero_title        text,                     -- "CATALOGUE DE FORMATIONS"
  hero_subtitle     text,                     -- ligne sous le titre
  hero_year         text,                     -- "2026"
  color_primary     text not null default '#1e40af',   -- bleu marine CAP NUMÉRIQUE
  color_secondary   text not null default '#06b6d4',   -- cyan vif CAP NUMÉRIQUE
  color_text        text not null default '#0f172a',
  font_family       text not null default 'Inter',     -- Inter | Lato | Georgia

  -- Contenu éditorial (blocs activables)
  blocks            jsonb not null default '{}'::jsonb,

  -- PDF généré (cache)
  pdf_url           text,
  pdf_generated_at  timestamptz,

  -- Méta
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_catalog_org      on public.catalog(organization_id);
create index idx_catalog_slug     on public.catalog(slug);
create index idx_catalog_publish  on public.catalog(is_published) where is_published;

comment on table  public.catalog is 'Catalogue commercial publiable en ligne (1 par organisation)';
comment on column public.catalog.slug is 'Slug pour l''URL publique /c/[slug]';
comment on column public.catalog.is_published is 'Si true, le catalogue est accessible publiquement sans connexion';
comment on column public.catalog.blocks is 'Blocs éditoriaux (JSON) : présentation, à propos, engagements, témoignages, modalités, CTA, mentions légales';
comment on column public.catalog.pdf_url is 'URL du PDF généré et mis en cache dans Supabase Storage';

-- Trigger updated_at
create trigger catalog_updated_at
  before update on public.catalog
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table public.catalog enable row level security;

-- SELECT (anonyme) : tout le monde peut lire un catalogue publié
create policy "catalog_select_public_when_published"
  on public.catalog for select
  using (is_published = true);

-- SELECT (membre) : les membres voient leur catalogue même non publié
create policy "catalog_select_org_members"
  on public.catalog for select
  using (public.is_org_member(organization_id));

-- INSERT/UPDATE/DELETE : admin/manager uniquement
create policy "catalog_insert_authorized"
  on public.catalog for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role)
  );

create policy "catalog_update_authorized"
  on public.catalog for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role)
  );

create policy "catalog_delete_authorized"
  on public.catalog for delete
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role)
  );

-- ---------------------------------------------------------
-- Lecture publique des fiches formation incluses dans un catalogue publié
-- ---------------------------------------------------------
-- Les visiteurs anonymes doivent pouvoir lire les formations
-- - publiées en ligne (is_published_online = true)
-- - non archivées
-- - dont l'organisation a un catalogue publié
create policy "formations_select_public_in_published_catalog"
  on public.formations for select
  using (
    is_published_online = true
    and status <> 'archived'
    and exists (
      select 1
      from public.catalog c
      where c.organization_id = formations.organization_id
        and c.is_published = true
    )
  );

-- Les catégories doivent aussi être lisibles pour le groupement par thème
create policy "formation_categories_select_public_via_catalog"
  on public.formation_categories for select
  using (
    exists (
      select 1
      from public.catalog c
      where c.organization_id = formation_categories.organization_id
        and c.is_published = true
    )
  );

-- L'organisation (nom, logo, mentions légales) doit être lisible
-- pour afficher l'identité visuelle du catalogue
create policy "organizations_select_public_via_catalog"
  on public.organizations for select
  using (
    exists (
      select 1
      from public.catalog c
      where c.organization_id = organizations.id
        and c.is_published = true
    )
  );

-- ---------------------------------------------------------
-- Storage : bucket public pour les PDF de catalogues générés
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('catalog-pdf', 'catalog-pdf', true)
on conflict (id) do nothing;

-- Politiques storage : lecture publique, écriture par admin/manager
do $$
begin
  -- Lecture publique
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'catalog_pdf_public_read'
  ) then
    create policy "catalog_pdf_public_read"
      on storage.objects for select
      using (bucket_id = 'catalog-pdf');
  end if;

  -- Upload réservé aux membres authentifiés (la couche applicative
  -- s'assurera ensuite des bons droits via la table catalog)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'catalog_pdf_member_write'
  ) then
    create policy "catalog_pdf_member_write"
      on storage.objects for insert
      with check (bucket_id = 'catalog-pdf' and auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'catalog_pdf_member_update'
  ) then
    create policy "catalog_pdf_member_update"
      on storage.objects for update
      using (bucket_id = 'catalog-pdf' and auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'catalog_pdf_member_delete'
  ) then
    create policy "catalog_pdf_member_delete"
      on storage.objects for delete
      using (bucket_id = 'catalog-pdf' and auth.uid() is not null);
  end if;
end $$;
