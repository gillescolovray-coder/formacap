-- Traçabilité Qualiopi : envois du lien portail (pour télécharger les supports)
-- déclenchés par un OF/prescripteur depuis son portail (Gilles 2026-06-26).
-- Prouve QUI a transmis les supports à QUEL apprenant et QUAND.
create table if not exists public.support_link_sends (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  session_id         uuid not null references public.sessions(id) on delete cascade,
  enrollment_id      uuid references public.session_enrollments(id) on delete set null,
  learner_id         uuid references public.learners(id) on delete set null,
  learner_email      text,
  -- OF / prescripteur qui a déclenché l'envoi (depuis son portail partenaire).
  sent_by_company_id uuid references public.companies(id) on delete set null,
  sent_by_label      text,
  sent_at            timestamptz not null default now()
);

create index if not exists idx_support_link_sends_session
  on public.support_link_sends(session_id);
create index if not exists idx_support_link_sends_enrollment
  on public.support_link_sends(enrollment_id);

alter table public.support_link_sends enable row level security;

-- Lecture : membres de l'organisation (le portail partenaire lit/écrit via le
-- client service_role, qui contourne la RLS).
drop policy if exists "support_link_sends_select_org" on public.support_link_sends;
create policy "support_link_sends_select_org"
  on public.support_link_sends for select
  using (public.is_org_member(organization_id));
