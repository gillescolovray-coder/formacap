-- 0101 — Bilan formateur de fin de session (Module 7 du portail formateur)
--
-- But : tracer un "retour formateur" pour chaque session animée.
-- Couvre les indicateurs Qualiopi RNQ :
--   - 11 (atteinte des objectifs)
--   - 22 (mesures d'engagement)
--   - 32 (amélioration continue)
--
-- Gilles 2026-05-23. Nom "Bilan formateur" validé pour distinguer du
-- futur "Bilan pédagogique entreprise" qui aura son propre module.
--
-- Structure : table dédiée 1:1 avec sessions (unicité sur session_id)
-- + colonne JSONB `report` pour souplesse d'évolution du formulaire
-- (même pattern que positioning_responses.data — cf. Sprint D).

create table if not exists public.session_trainer_reports (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null unique references public.sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trainer_id      uuid references public.trainers(id) on delete set null,

  -- Contenu structuré du bilan (objectifs, niveau du groupe, adaptations,
  -- engagement, difficultés, améliorations, recommandations par apprenant).
  -- Cf. src/lib/trainer-report/types.ts pour le schéma TypeScript.
  report jsonb not null default '{}'::jsonb,

  -- Signature électronique du formateur (data URL PNG via SignaturePad).
  signer_name      text,
  signature_data   text,
  signed_at        timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_trainer_reports_session_id_idx
  on public.session_trainer_reports(session_id);
create index if not exists session_trainer_reports_organization_id_idx
  on public.session_trainer_reports(organization_id);

-- Trigger updated_at (réutilise la fonction commune set_updated_at si elle existe)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists set_updated_at_session_trainer_reports
      on public.session_trainer_reports;
    create trigger set_updated_at_session_trainer_reports
      before update on public.session_trainer_reports
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- RLS : on suit la même politique que les autres tables liées aux sessions
-- (org-scoped via la session). Le portail formateur passe par
-- createAdminClient() qui bypass RLS — on garde RLS pour l'app admin.
alter table public.session_trainer_reports enable row level security;

drop policy if exists session_trainer_reports_select_org
  on public.session_trainer_reports;
create policy session_trainer_reports_select_org
  on public.session_trainer_reports
  for select
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.profile_id = auth.uid()
        and om.is_active
    )
  );

drop policy if exists session_trainer_reports_modify_org
  on public.session_trainer_reports;
create policy session_trainer_reports_modify_org
  on public.session_trainer_reports
  for all
  using (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.profile_id = auth.uid()
        and om.is_active
    )
  )
  with check (
    organization_id in (
      select om.organization_id
      from public.organization_members om
      where om.profile_id = auth.uid()
        and om.is_active
    )
  );

comment on table public.session_trainer_reports is
  'Bilan formateur (Module 7 portail formateur) — couvre Qualiopi RNQ ind. 11/22/32. 1 ligne par session animée.';
comment on column public.session_trainer_reports.report is
  'Contenu structuré JSON du bilan (objectifs atteints, niveau groupe, adaptations, engagement, difficultés, améliorations, recos par apprenant). Schéma : src/lib/trainer-report/types.ts.';
comment on column public.session_trainer_reports.signature_data is
  'Signature formateur (data URL PNG via SignaturePad) — R9 Qualiopi : tracée en direct.';
