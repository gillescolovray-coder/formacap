-- =========================================================================
-- 0067 — Bandeau commercial de l'organisation sur les documents
--
-- Décision Gilles 2026-05-14. Sur la première page des conventions de
-- formation, on souhaite afficher un bandeau image qui présente les
-- autres produits et services de l'OF (cross-selling). Le bandeau est
-- défini une fois pour toute l'organisation.
--
-- Stockage : bucket privé "organization-banners" (créé ci-dessous).
-- L'image est référencée par son chemin (path) ; on génère une URL
-- signée à la volée pour l'inclure dans les PDF.
-- =========================================================================

alter table public.organizations
  add column if not exists commercial_banner_path text,
  add column if not exists commercial_banner_filename text,
  add column if not exists commercial_banner_uploaded_at timestamptz;

comment on column public.organizations.commercial_banner_path is
  'Chemin du bandeau commercial dans le bucket organization-banners (ex: org_<uuid>/banner_<timestamp>.png). Affiché sur la page 1 des conventions. Migration 0067.';
comment on column public.organizations.commercial_banner_filename is
  'Nom de fichier original choisi par l''utilisateur (affichage UI). Migration 0067.';
comment on column public.organizations.commercial_banner_uploaded_at is
  'Horodatage de l''upload. Migration 0067.';

-- -------------------------------------------------------------------------
-- Bucket Storage : organization-banners (public, comme le logo)
-- -------------------------------------------------------------------------
-- On marque le bucket comme public pour pouvoir inclure l'URL directement
-- dans le HTML de la convention sans avoir à gérer de signature pour
-- chaque rendu Puppeteer.
insert into storage.buckets (id, name, public)
values ('organization-banners', 'organization-banners', true)
on conflict (id) do nothing;

-- RLS : tout le monde peut lire (bucket public) ; seuls admin/manager de
-- l'organisation peuvent uploader/modifier/supprimer leur propre bandeau.
drop policy if exists "org_banner_select"
  on storage.objects;
create policy "org_banner_select"
  on storage.objects for select
  using (bucket_id = 'organization-banners');

drop policy if exists "org_banner_insert"
  on storage.objects;
create policy "org_banner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'organization-banners'
    and exists (
      select 1
      from public.organization_members om
      where om.profile_id = auth.uid()
        and om.is_active = true
        and (
          public.has_org_role(om.organization_id, 'admin'::public.app_role)
          or public.has_org_role(om.organization_id, 'manager'::public.app_role)
        )
        and (storage.foldername(name))[1] = 'org_' || om.organization_id::text
    )
  );

drop policy if exists "org_banner_update"
  on storage.objects;
create policy "org_banner_update"
  on storage.objects for update
  using (
    bucket_id = 'organization-banners'
    and exists (
      select 1
      from public.organization_members om
      where om.profile_id = auth.uid()
        and om.is_active = true
        and (
          public.has_org_role(om.organization_id, 'admin'::public.app_role)
          or public.has_org_role(om.organization_id, 'manager'::public.app_role)
        )
        and (storage.foldername(name))[1] = 'org_' || om.organization_id::text
    )
  );

drop policy if exists "org_banner_delete"
  on storage.objects;
create policy "org_banner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'organization-banners'
    and exists (
      select 1
      from public.organization_members om
      where om.profile_id = auth.uid()
        and om.is_active = true
        and (
          public.has_org_role(om.organization_id, 'admin'::public.app_role)
          or public.has_org_role(om.organization_id, 'manager'::public.app_role)
        )
        and (storage.foldername(name))[1] = 'org_' || om.organization_id::text
    )
  );
