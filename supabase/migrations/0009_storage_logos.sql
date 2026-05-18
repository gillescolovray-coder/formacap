-- =========================================================
-- Migration 0009 : stockage des logos d'organisation
-- =========================================================
-- Crée un bucket Supabase Storage "organization-logos" public
-- en lecture (les logos s'affichent sur les documents imprimés).
-- Upload/delete réservés aux administrateurs.
-- =========================================================

insert into storage.buckets (id, name, public)
values ('organization-logos', 'organization-logos', true)
on conflict (id) do nothing;

-- Lecture : publique (bucket public de toute façon)
drop policy if exists "logos_public_read" on storage.objects;
create policy "logos_public_read"
  on storage.objects for select
  using (bucket_id = 'organization-logos');

-- Écriture : admin uniquement
drop policy if exists "logos_admin_insert" on storage.objects;
create policy "logos_admin_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'organization-logos'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.role = 'admin'::public.app_role
        and m.is_active
    )
  );

drop policy if exists "logos_admin_update" on storage.objects;
create policy "logos_admin_update"
  on storage.objects for update
  using (
    bucket_id = 'organization-logos'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.role = 'admin'::public.app_role
        and m.is_active
    )
  );

drop policy if exists "logos_admin_delete" on storage.objects;
create policy "logos_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'organization-logos'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.role = 'admin'::public.app_role
        and m.is_active
    )
  );
