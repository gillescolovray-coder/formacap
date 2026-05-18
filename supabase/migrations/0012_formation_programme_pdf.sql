-- =========================================================
-- Migration 0012 : programme PDF joint + bucket de stockage
-- =========================================================

-- Colonnes sur formations
alter table public.formations
  add column if not exists programme_pdf_url text;

alter table public.formations
  add column if not exists programme_pdf_name text;

-- Bucket public pour les PDF programme
insert into storage.buckets (id, name, public)
values ('formation-programmes', 'formation-programmes', true)
on conflict (id) do nothing;

-- Lecture publique (téléchargement libre via l'URL)
drop policy if exists "formation_programmes_public_read" on storage.objects;
create policy "formation_programmes_public_read"
  on storage.objects for select
  using (bucket_id = 'formation-programmes');

-- Écriture réservée aux rôles éditeurs de formations
drop policy if exists "formation_programmes_insert" on storage.objects;
create policy "formation_programmes_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'formation-programmes'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.is_active
        and m.role in ('admin'::public.app_role, 'manager'::public.app_role, 'pedagogy_lead'::public.app_role)
    )
  );

drop policy if exists "formation_programmes_update" on storage.objects;
create policy "formation_programmes_update"
  on storage.objects for update
  using (
    bucket_id = 'formation-programmes'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.is_active
        and m.role in ('admin'::public.app_role, 'manager'::public.app_role, 'pedagogy_lead'::public.app_role)
    )
  );

drop policy if exists "formation_programmes_delete" on storage.objects;
create policy "formation_programmes_delete"
  on storage.objects for delete
  using (
    bucket_id = 'formation-programmes'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.is_active
        and m.role in ('admin'::public.app_role, 'manager'::public.app_role, 'pedagogy_lead'::public.app_role)
    )
  );
