-- =========================================================
-- Migration 0047 : Dossier central de session (sprints A-E)
-- =========================================================
-- Regroupe les changements BDD nécessaires pour :
--   - Convocations (B) : tracking d'envoi
--   - Documents partages (C) : table + bucket storage
--   - Évaluation à chaud (D) : table + flag d'ouverture
--   - Attestations (E) : aucune nouvelle table (calculs depuis attendances)
-- =========================================================

-- ---------------------------------------------------------
-- B. Convocations : tracking d'envoi par enrollment
-- ---------------------------------------------------------
alter table public.session_enrollments
  add column if not exists convocation_sent_at timestamptz;

comment on column public.session_enrollments.convocation_sent_at is
  'Date d''envoi de la convocation a l''apprenant. NULL = non encore envoyee.';

-- ---------------------------------------------------------
-- C. Documents partages : table session_documents
-- ---------------------------------------------------------
create table if not exists public.session_documents (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name       text not null,
  storage_path    text not null,
  mime_type       text,
  size_bytes      bigint,
  description     text,
  visibility      text not null default 'internal'
    check (visibility in ('internal', 'shared_with_learners')),
  uploaded_by     uuid references public.profiles(id),
  uploaded_at     timestamptz not null default now()
);

create index if not exists idx_session_documents_session
  on public.session_documents(session_id);
create index if not exists idx_session_documents_org
  on public.session_documents(organization_id);

comment on table public.session_documents is
  'Documents partages lies a une session (programme, supports, conventions...). Stocks dans le bucket Supabase session-documents.';

alter table public.session_documents enable row level security;

drop policy if exists "session_documents_select_org" on public.session_documents;
create policy "session_documents_select_org"
  on public.session_documents for select
  using (public.is_org_member(organization_id));

drop policy if exists "session_documents_insert_authorized"
  on public.session_documents;
create policy "session_documents_insert_authorized"
  on public.session_documents for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role) or
    public.has_org_role(organization_id, 'trainer'::public.app_role)
  );

drop policy if exists "session_documents_delete_authorized"
  on public.session_documents;
create policy "session_documents_delete_authorized"
  on public.session_documents for delete
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

-- Bucket de stockage pour les documents de session
insert into storage.buckets (id, name, public)
values ('session-documents', 'session-documents', false)
on conflict (id) do nothing;

drop policy if exists "session_documents_storage_select" on storage.objects;
create policy "session_documents_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'session-documents'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid() and m.is_active
    )
  );

drop policy if exists "session_documents_storage_insert" on storage.objects;
create policy "session_documents_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'session-documents'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid() and m.is_active
        and m.role in (
          'admin'::public.app_role,
          'manager'::public.app_role,
          'pedagogy_lead'::public.app_role,
          'trainer'::public.app_role
        )
    )
  );

drop policy if exists "session_documents_storage_delete" on storage.objects;
create policy "session_documents_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'session-documents'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid() and m.is_active
        and m.role in (
          'admin'::public.app_role,
          'manager'::public.app_role,
          'pedagogy_lead'::public.app_role
        )
    )
  );

-- ---------------------------------------------------------
-- D. Évaluation à chaud : flag d'ouverture + table de réponses
-- ---------------------------------------------------------
alter table public.sessions
  add column if not exists evaluation_open boolean not null default false;

comment on column public.sessions.evaluation_open is
  'Indique si le lien public d''evaluation a chaud est actif. Si false, le formulaire renvoie un message "ferme".';

create table if not exists public.session_evaluations (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.sessions(id) on delete cascade,
  rating_overall      int  not null check (rating_overall between 1 and 5),
  rating_content      int  check (rating_content between 1 and 5),
  rating_trainer      int  check (rating_trainer between 1 and 5),
  rating_conditions   int  check (rating_conditions between 1 and 5),
  rating_objectives   int  check (rating_objectives between 1 and 5),
  comment             text,
  submitter_ip        text,
  submitted_at        timestamptz not null default now()
);

create index if not exists idx_session_evaluations_session
  on public.session_evaluations(session_id);

comment on table public.session_evaluations is
  'Reponses anonymes au questionnaire d''evaluation a chaud. Aucune donnee d''identite n''est stockee (just IP pour audit).';

alter table public.session_evaluations enable row level security;

-- Lecture : membres de l'org propriétaire de la session
drop policy if exists "session_evaluations_select_org"
  on public.session_evaluations;
create policy "session_evaluations_select_org"
  on public.session_evaluations for select
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and public.is_org_member(s.organization_id)
  ));

-- Insertion : ANONYME (lien public, pas de connexion requise). On ne
-- vérifie que l'existence de la session avec evaluation_open = true,
-- ce qui est imposé côté action serveur. Pour ne pas bloquer, on
-- autorise INSERT à tout le monde (la fonction action vérifie).
drop policy if exists "session_evaluations_insert_public"
  on public.session_evaluations;
create policy "session_evaluations_insert_public"
  on public.session_evaluations for insert
  with check (exists (
    select 1 from public.sessions s
    where s.id = session_id and s.evaluation_open = true
  ));

-- Suppression : admins de l'org seulement
drop policy if exists "session_evaluations_delete_admin"
  on public.session_evaluations;
create policy "session_evaluations_delete_admin"
  on public.session_evaluations for delete
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id
      and public.has_org_role(s.organization_id, 'admin'::public.app_role)
  ));
