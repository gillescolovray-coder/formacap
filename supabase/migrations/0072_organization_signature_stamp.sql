-- =========================================================================
-- 0072 — Signature & cachet de l'organisme de formation
--
-- Décision Gilles 2026-05-14 : pour automatiser la signature des
-- documents générés (convention, attestation, etc.), on stocke une fois
-- pour toute l'organisation une image combinée « cachet + signature »
-- du dirigeant.
--
-- Stockage : bucket PRIVÉ "organization-signatures" (sensible, ne doit
-- jamais être public). Les PDFs intègrent l'image en base64 via un
-- fetch serveur authentifié (jamais d'URL exposée au navigateur).
-- =========================================================================

alter table public.organizations
  add column if not exists signature_stamp_path text,
  add column if not exists signature_stamp_filename text,
  add column if not exists signature_stamp_uploaded_at timestamptz;

comment on column public.organizations.signature_stamp_path is
  'Chemin de l''image signature + cachet du dirigeant dans le bucket privé organization-signatures (ex: org_<uuid>/signature_<timestamp>.png). Intégrée sur les documents générés (convention, attestation...). Migration 0072.';
comment on column public.organizations.signature_stamp_filename is
  'Nom de fichier original choisi par l''utilisateur (affichage UI). Migration 0072.';
comment on column public.organizations.signature_stamp_uploaded_at is
  'Horodatage de l''upload. Migration 0072.';

-- -------------------------------------------------------------------------
-- Bucket Storage : organization-signatures (PRIVÉ — document sensible)
-- -------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('organization-signatures', 'organization-signatures', false)
on conflict (id) do nothing;

-- RLS : seuls admin/manager de l'organisation peuvent lire ET écrire
-- leur propre signature (chaque org dans son dossier org_<uuid>/...).

drop policy if exists "org_signature_select"
  on storage.objects;
create policy "org_signature_select"
  on storage.objects for select
  using (
    bucket_id = 'organization-signatures'
    and exists (
      select 1
      from public.organization_members om
      where om.profile_id = auth.uid()
        and om.is_active = true
        and (storage.foldername(name))[1] = 'org_' || om.organization_id::text
    )
  );

drop policy if exists "org_signature_insert"
  on storage.objects;
create policy "org_signature_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'organization-signatures'
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

drop policy if exists "org_signature_update"
  on storage.objects;
create policy "org_signature_update"
  on storage.objects for update
  using (
    bucket_id = 'organization-signatures'
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

drop policy if exists "org_signature_delete"
  on storage.objects;
create policy "org_signature_delete"
  on storage.objects for delete
  using (
    bucket_id = 'organization-signatures'
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
