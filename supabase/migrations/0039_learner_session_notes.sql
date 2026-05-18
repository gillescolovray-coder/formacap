-- =========================================================================
-- 0039 — Notes datées sur Apprenant, Session et Inscription
--
-- Reproduit la structure de `company_notes` (migration 0031) sur deux
-- nouvelles entités, plus une table partagée `session_enrollment_notes`
-- qui rattache une note à un couple (session, apprenant) précis : ces
-- notes sont visibles depuis la fiche apprenant ET la fiche session.
--
-- Migration des données existantes :
--   - learners.notes (texte libre)             → learner_notes (action 'info')
--   - sessions.notes (texte libre)             → session_notes (action 'info')
--   - session_enrollments.notes (texte libre)  → session_enrollment_notes (action 'info')
-- Les colonnes texte d'origine sont conservées pour le moment (rollback
-- éventuel) — pourront être supprimées une fois le nouveau système validé.
-- =========================================================================

-- ----------------------------------------------------------------------
-- 1) Notes apprenant
-- ----------------------------------------------------------------------
create table if not exists public.learner_notes (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  action_type text check (
    action_type in (
      'a_rappeler',
      'a_relancer',
      'rdv_planifie',
      'devis_envoye',
      'email_envoye',
      'document_recu',
      'info',
      'autre'
    )
  ),
  due_date date,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists learner_notes_learner_idx
  on public.learner_notes (learner_id, created_at desc);

alter table public.learner_notes enable row level security;

drop policy if exists "learner_notes_select_org" on public.learner_notes;
create policy "learner_notes_select_org" on public.learner_notes
  for select
  using (
    exists (
      select 1 from public.learners l
      join public.organization_members om
        on om.organization_id = l.organization_id
      where l.id = learner_notes.learner_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

drop policy if exists "learner_notes_insert_org" on public.learner_notes;
create policy "learner_notes_insert_org" on public.learner_notes
  for insert
  with check (
    exists (
      select 1 from public.learners l
      join public.organization_members om
        on om.organization_id = l.organization_id
      where l.id = learner_notes.learner_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

drop policy if exists "learner_notes_update_org" on public.learner_notes;
create policy "learner_notes_update_org" on public.learner_notes
  for update
  using (
    exists (
      select 1 from public.learners l
      join public.organization_members om
        on om.organization_id = l.organization_id
      where l.id = learner_notes.learner_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

drop policy if exists "learner_notes_delete_org" on public.learner_notes;
create policy "learner_notes_delete_org" on public.learner_notes
  for delete
  using (
    exists (
      select 1 from public.learners l
      join public.organization_members om
        on om.organization_id = l.organization_id
      where l.id = learner_notes.learner_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

-- ----------------------------------------------------------------------
-- 2) Notes session
-- ----------------------------------------------------------------------
create table if not exists public.session_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  action_type text check (
    action_type in (
      'a_rappeler',
      'a_relancer',
      'rdv_planifie',
      'devis_envoye',
      'email_envoye',
      'document_recu',
      'info',
      'autre'
    )
  ),
  due_date date,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists session_notes_session_idx
  on public.session_notes (session_id, created_at desc);

alter table public.session_notes enable row level security;

drop policy if exists "session_notes_select_org" on public.session_notes;
create policy "session_notes_select_org" on public.session_notes
  for select
  using (
    exists (
      select 1 from public.sessions s
      join public.organization_members om
        on om.organization_id = s.organization_id
      where s.id = session_notes.session_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

drop policy if exists "session_notes_insert_org" on public.session_notes;
create policy "session_notes_insert_org" on public.session_notes
  for insert
  with check (
    exists (
      select 1 from public.sessions s
      join public.organization_members om
        on om.organization_id = s.organization_id
      where s.id = session_notes.session_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

drop policy if exists "session_notes_update_org" on public.session_notes;
create policy "session_notes_update_org" on public.session_notes
  for update
  using (
    exists (
      select 1 from public.sessions s
      join public.organization_members om
        on om.organization_id = s.organization_id
      where s.id = session_notes.session_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

drop policy if exists "session_notes_delete_org" on public.session_notes;
create policy "session_notes_delete_org" on public.session_notes
  for delete
  using (
    exists (
      select 1 from public.sessions s
      join public.organization_members om
        on om.organization_id = s.organization_id
      where s.id = session_notes.session_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

-- ----------------------------------------------------------------------
-- 3) Notes d'inscription (partagées apprenant ↔ session)
-- ----------------------------------------------------------------------
create table if not exists public.session_enrollment_notes (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.session_enrollments(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  action_type text check (
    action_type in (
      'a_rappeler',
      'a_relancer',
      'rdv_planifie',
      'devis_envoye',
      'email_envoye',
      'document_recu',
      'info',
      'autre'
    )
  ),
  due_date date,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists session_enrollment_notes_enrollment_idx
  on public.session_enrollment_notes (enrollment_id, created_at desc);

alter table public.session_enrollment_notes enable row level security;

drop policy if exists "enrollment_notes_select_org" on public.session_enrollment_notes;
create policy "enrollment_notes_select_org" on public.session_enrollment_notes
  for select
  using (
    exists (
      select 1 from public.session_enrollments se
      join public.sessions s on s.id = se.session_id
      join public.organization_members om
        on om.organization_id = s.organization_id
      where se.id = session_enrollment_notes.enrollment_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

drop policy if exists "enrollment_notes_insert_org" on public.session_enrollment_notes;
create policy "enrollment_notes_insert_org" on public.session_enrollment_notes
  for insert
  with check (
    exists (
      select 1 from public.session_enrollments se
      join public.sessions s on s.id = se.session_id
      join public.organization_members om
        on om.organization_id = s.organization_id
      where se.id = session_enrollment_notes.enrollment_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

drop policy if exists "enrollment_notes_update_org" on public.session_enrollment_notes;
create policy "enrollment_notes_update_org" on public.session_enrollment_notes
  for update
  using (
    exists (
      select 1 from public.session_enrollments se
      join public.sessions s on s.id = se.session_id
      join public.organization_members om
        on om.organization_id = s.organization_id
      where se.id = session_enrollment_notes.enrollment_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

drop policy if exists "enrollment_notes_delete_org" on public.session_enrollment_notes;
create policy "enrollment_notes_delete_org" on public.session_enrollment_notes
  for delete
  using (
    exists (
      select 1 from public.session_enrollments se
      join public.sessions s on s.id = se.session_id
      join public.organization_members om
        on om.organization_id = s.organization_id
      where se.id = session_enrollment_notes.enrollment_id
        and om.profile_id = auth.uid()
        and om.is_active
    )
  );

-- ----------------------------------------------------------------------
-- 4) Migration des notes texte existantes
-- ----------------------------------------------------------------------
insert into public.learner_notes (learner_id, content, action_type, created_at)
select id, notes, 'info', coalesce(updated_at, now())
from public.learners
where notes is not null and length(trim(notes)) > 0
  and not exists (
    select 1 from public.learner_notes ln where ln.learner_id = learners.id
  );

insert into public.session_notes (session_id, content, action_type, created_at)
select id, notes, 'info', coalesce(updated_at, now())
from public.sessions
where notes is not null and length(trim(notes)) > 0
  and not exists (
    select 1 from public.session_notes sn where sn.session_id = sessions.id
  );

insert into public.session_enrollment_notes (enrollment_id, content, action_type, created_at)
select id, notes, 'info', coalesce(updated_at, enrolled_at, now())
from public.session_enrollments
where notes is not null and length(trim(notes)) > 0
  and not exists (
    select 1 from public.session_enrollment_notes en where en.enrollment_id = session_enrollments.id
  );

comment on table public.learner_notes is
  'Notes datées sur la fiche apprenant. Aligné avec company_notes.';
comment on table public.session_notes is
  'Notes datées sur la fiche session.';
comment on table public.session_enrollment_notes is
  'Notes datées rattachées à un couple (session, apprenant) — visibles sur les deux fiches.';

-- Force le rechargement du cache de schéma PostgREST.
notify pgrst, 'reload schema';
