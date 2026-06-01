-- Migration 0114 : Cachet + signature OF (CAP NUMERIQUE)
-- Date : 2026-06-01
-- Auteur : Gilles + Claude
--
-- OBJECTIF :
-- Ajouter une image combinée cachet + signature de l OF qui sera
-- automatiquement apposée sur :
--   - Feuilles d emargement PDF (collectives + individuelles)
--   - (futur) Conventions, attestations, factures...
--
-- L image est stockee dans le bucket Storage `organization-assets`
-- (nouveau bucket public-read). Le champ stocke l URL publique.

alter table public.organizations
  add column if not exists signature_image_url text;

comment on column public.organizations.signature_image_url is
  'URL publique d une image combinant le cachet + la signature de l OF (PNG/JPG). Apposee automatiquement sur les feuilles d emargement, conventions PDF, etc. Bucket : organization-assets. Migration 0114 — 2026-06-01.';

-- Bucket Storage : on s assure de son existence + politique public read.
-- (Idempotent : safe meme si deja cree)
insert into storage.buckets (id, name, public)
values ('organization-assets', 'organization-assets', true)
on conflict (id) do nothing;

-- Politiques RLS pour le bucket (lecture publique, ecriture authentifiee)
drop policy if exists "organization_assets_public_read"
  on storage.objects;
create policy "organization_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'organization-assets');

drop policy if exists "organization_assets_authenticated_write"
  on storage.objects;
create policy "organization_assets_authenticated_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'organization-assets');

drop policy if exists "organization_assets_authenticated_update"
  on storage.objects;
create policy "organization_assets_authenticated_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'organization-assets');

drop policy if exists "organization_assets_authenticated_delete"
  on storage.objects;
create policy "organization_assets_authenticated_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'organization-assets');

-- FIN Migration 0114
