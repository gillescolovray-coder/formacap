-- =====================================================================
-- 0092_company_logos_bucket.sql
-- Bucket Storage pour les logos des entreprises partenaires
-- =====================================================================
--
-- Permet aux admins de CAP NUMÉRIQUE d'uploader un logo pour chaque
-- entreprise partenaire (OF / prescripteur) depuis la fiche entreprise.
-- L'URL publique est ensuite stockée dans `companies.logo_url`
-- (cf. migration 0091).
--
-- Bucket marqué public pour pouvoir afficher l'URL directement dans
-- la page publique `/preinscription/[token]` sans gestion de signature.

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
-- Lecture : tout le monde (bucket public). Indispensable pour que la
-- page de pré-inscription (publique, sans auth) puisse afficher le logo.
drop policy if exists "company_logo_select"
  on storage.objects;
create policy "company_logo_select"
  on storage.objects for select
  using (bucket_id = 'company-logos');

-- Convention de path : `{companyId}/logo-{timestamp}.{ext}` — le
-- premier segment est l'UUID de la company. On vérifie que l'utilisateur
-- est admin/manager de l'organisation propriétaire de cette company.
drop policy if exists "company_logo_insert"
  on storage.objects;
create policy "company_logo_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies c
      join public.organization_members om
        on om.organization_id = c.organization_id
      where c.id::text = (storage.foldername(name))[1]
        and om.profile_id = auth.uid()
        and om.is_active = true
        and (
          public.has_org_role(om.organization_id, 'admin'::public.app_role)
          or public.has_org_role(om.organization_id, 'manager'::public.app_role)
        )
    )
  );

drop policy if exists "company_logo_update"
  on storage.objects;
create policy "company_logo_update"
  on storage.objects for update
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies c
      join public.organization_members om
        on om.organization_id = c.organization_id
      where c.id::text = (storage.foldername(name))[1]
        and om.profile_id = auth.uid()
        and om.is_active = true
        and (
          public.has_org_role(om.organization_id, 'admin'::public.app_role)
          or public.has_org_role(om.organization_id, 'manager'::public.app_role)
        )
    )
  );

drop policy if exists "company_logo_delete"
  on storage.objects;
create policy "company_logo_delete"
  on storage.objects for delete
  using (
    bucket_id = 'company-logos'
    and exists (
      select 1
      from public.companies c
      join public.organization_members om
        on om.organization_id = c.organization_id
      where c.id::text = (storage.foldername(name))[1]
        and om.profile_id = auth.uid()
        and om.is_active = true
        and (
          public.has_org_role(om.organization_id, 'admin'::public.app_role)
          or public.has_org_role(om.organization_id, 'manager'::public.app_role)
        )
    )
  );
