-- =========================================================================
-- 0066 — Stockage du certificat Qualiopi par organisation
--
-- Décision Gilles 2026-05-14. Le certificat Qualiopi (PDF) doit être :
--   1. Uploadable depuis Paramètres > Organisation
--   2. Visible avec sa date d'expiration (alerte si <3 mois)
--   3. Joint automatiquement aux conventions de formation envoyées
--
-- Stockage : Supabase Storage bucket "qualiopi-certificates" (privé).
-- Les colonnes ci-dessous tracent uniquement les métadonnées.
-- =========================================================================

alter table public.organizations
  add column if not exists qualiopi_certificate_path text,
  add column if not exists qualiopi_certificate_filename text,
  add column if not exists qualiopi_certificate_expires_at date,
  add column if not exists qualiopi_certificate_uploaded_at timestamptz;

comment on column public.organizations.qualiopi_certificate_path is
  'Chemin du fichier PDF dans le bucket Supabase Storage qualiopi-certificates (ex: org_<uuid>/cert_<timestamp>.pdf). Migration 0066.';
comment on column public.organizations.qualiopi_certificate_filename is
  'Nom de fichier original choisi par l''utilisateur (affichage UI). Migration 0066.';
comment on column public.organizations.qualiopi_certificate_expires_at is
  'Date d''expiration du certificat Qualiopi. Sert à afficher une alerte si <3 mois. Migration 0066.';
comment on column public.organizations.qualiopi_certificate_uploaded_at is
  'Horodatage de l''upload — pour audit / preuve de fraîcheur du certificat. Migration 0066.';

-- -------------------------------------------------------------------------
-- Bucket Storage : qualiopi-certificates (privé)
-- -------------------------------------------------------------------------
-- On crée le bucket via l'API Storage. Si le bucket existe déjà, on ignore.
insert into storage.buckets (id, name, public)
values ('qualiopi-certificates', 'qualiopi-certificates', false)
on conflict (id) do nothing;

-- RLS sur le bucket : seuls les membres de l'organisation peuvent lire/écrire
-- leur propre certificat. Le chemin convention : org_<organization_id>/...
drop policy if exists "qualiopi_cert_select"
  on storage.objects;
create policy "qualiopi_cert_select"
  on storage.objects for select
  using (
    bucket_id = 'qualiopi-certificates'
    and exists (
      select 1
      from public.organization_members om
      where om.profile_id = auth.uid()
        and om.is_active = true
        and (storage.foldername(name))[1] = 'org_' || om.organization_id::text
    )
  );

drop policy if exists "qualiopi_cert_insert"
  on storage.objects;
create policy "qualiopi_cert_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'qualiopi-certificates'
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

drop policy if exists "qualiopi_cert_update"
  on storage.objects;
create policy "qualiopi_cert_update"
  on storage.objects for update
  using (
    bucket_id = 'qualiopi-certificates'
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

drop policy if exists "qualiopi_cert_delete"
  on storage.objects;
create policy "qualiopi_cert_delete"
  on storage.objects for delete
  using (
    bucket_id = 'qualiopi-certificates'
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
