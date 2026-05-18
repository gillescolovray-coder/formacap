-- =========================================================
-- Migration 0014 : Formateurs (Qualiopi indic. 21 et 22)
-- =========================================================
-- Référentiel des formateurs internes et externes.
-- Couvre le critère 5 du RNQ : qualification et développement
-- des compétences des personnels chargés des prestations.
-- =========================================================

create type public.trainer_status as enum (
  'salarie',
  'independant',
  'sous_traitant',
  'vacataire',
  'organisme_partenaire'
);

create type public.trainer_validation_status as enum (
  'a_valider',
  'valide',
  'suspendu',
  'archive'
);

create table public.trainers (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,

  -- Identification
  first_name                  text not null,
  last_name                   text not null,
  status                      public.trainer_status not null default 'independant',
  birth_date                  date,

  -- Coordonnées
  email                       text,
  phone                       text,
  mobile                      text,
  address                     text,
  postal_code                 text,
  city                        text,
  country                     text default 'France',

  -- Pour les externes
  siret                       text,
  legal_form                  text,
  company_name                text,
  nda                         text,           -- numéro déclaration activité si OF
  rib_on_file                 boolean default false,

  -- Statut juridique / contractuel
  contract_type               text,           -- CDI, CDD, prestation, sous-traitance, vacation, lettre de mission
  contract_reference          text,
  contract_start_date         date,
  contract_end_date           date,

  -- Domaines d'intervention
  intervention_domains        text[],         -- BTP, marchés publics, bureautique, IA…
  target_audiences            text[],         -- demandeurs, salariés, dirigeants…
  intervention_levels         text[],         -- débutant, intermédiaire, avancé, expert
  modalities                  text[],         -- presentiel, distanciel, hybride

  -- Compétences techniques & pédagogiques (rédigées)
  technical_skills            text,
  pedagogical_skills          text,
  years_pro_experience        int,
  years_training_experience   int,
  example_trainings           text,           -- exemples de formations animées

  -- Diplômes & certifications (jsonb pour souplesse)
  diplomas                    jsonb not null default '[]'::jsonb,
  -- Format attendu : [{type, title, year, issuer, expires_on?, file_url?}]

  -- Adéquation Qualiopi (justification)
  competence_justification    text,           -- pourquoi compétent pour ces formations

  -- Évaluation du formateur
  satisfaction_avg            numeric(4,2),   -- moyenne satisfaction stagiaires (sur 10 ou 5)
  satisfaction_scale          int default 5,
  last_evaluation_date        date,
  evaluation_notes            text,
  has_complaints              boolean default false,
  complaints_notes            text,

  -- Maintien / développement des compétences (Qualiopi 22)
  cpd_actions                 text,           -- formations suivies, veille, webinaires…
  last_cpd_date               date,

  -- Documents administratifs externes
  urssaf_attestation_on_file  boolean default false,
  urssaf_expires_on           date,
  rc_pro_on_file              boolean default false,
  rc_pro_expires_on           date,
  kbis_on_file                boolean default false,

  -- Engagement qualité
  charter_signed              boolean default false,
  charter_signed_on           date,
  handicap_procedure_ack      boolean default false,
  ri_ack                      boolean default false,

  -- Documents (jsonb : CV, diplômes, contrat, RC, URSSAF, charte signée…)
  documents                   jsonb not null default '[]'::jsonb,
  -- Format attendu : [{kind, file_url, file_name, label, uploaded_at, expires_on?}]

  -- Méta & gestion
  validation_status           public.trainer_validation_status not null default 'a_valider',
  validated_by                uuid references public.profiles(id),
  validated_on                date,
  is_active                   boolean not null default true,
  notes_internal              text,
  created_by                  uuid references public.profiles(id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_trainers_org      on public.trainers(organization_id);
create index idx_trainers_status   on public.trainers(status);
create index idx_trainers_active   on public.trainers(organization_id, is_active);
create index idx_trainers_name     on public.trainers(organization_id, last_name, first_name);

create trigger trainers_updated_at
  before update on public.trainers
  for each row execute function public.set_updated_at();

comment on table public.trainers is
  'Référentiel des formateurs internes et externes (Qualiopi crit. 5).';

-- ---------------------------------------------------------
-- Lien depuis sessions vers le formateur référencé
-- ---------------------------------------------------------
alter table public.sessions
  add column if not exists trainer_id uuid
    references public.trainers(id) on delete set null;

create index if not exists idx_sessions_trainer
  on public.sessions(trainer_id);

comment on column public.sessions.trainer_id is
  'Formateur référencé (le champ trainer_name reste pour la rétrocompatibilité).';

-- ---------------------------------------------------------
-- Adéquation formation x formateur (table de liaison)
-- ---------------------------------------------------------
create table public.trainer_formations (
  trainer_id    uuid not null references public.trainers(id) on delete cascade,
  formation_id  uuid not null references public.formations(id) on delete cascade,
  justification text,
  created_at    timestamptz not null default now(),
  primary key (trainer_id, formation_id)
);

create index idx_trainer_formations_trainer on public.trainer_formations(trainer_id);
create index idx_trainer_formations_formation on public.trainer_formations(formation_id);

comment on table public.trainer_formations is
  'Liaison N:N entre formateurs et formations qu''ils sont autorisés à animer.';

-- ---------------------------------------------------------
-- RLS : trainers
-- ---------------------------------------------------------
alter table public.trainers enable row level security;

create policy "trainers_select_org"
  on public.trainers for select
  using (public.is_org_member(organization_id));

create policy "trainers_insert_authorized"
  on public.trainers for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "trainers_update_authorized"
  on public.trainers for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "trainers_delete_admin"
  on public.trainers for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));

-- ---------------------------------------------------------
-- RLS : trainer_formations (cascade via trainer)
-- ---------------------------------------------------------
alter table public.trainer_formations enable row level security;

create policy "trainer_formations_select_org"
  on public.trainer_formations for select
  using (
    exists (
      select 1 from public.trainers t
      where t.id = trainer_id
        and public.is_org_member(t.organization_id)
    )
  );

create policy "trainer_formations_modify_authorized"
  on public.trainer_formations for all
  using (
    exists (
      select 1 from public.trainers t
      where t.id = trainer_id
        and (
          public.has_org_role(t.organization_id, 'admin'::public.app_role) or
          public.has_org_role(t.organization_id, 'manager'::public.app_role) or
          public.has_org_role(t.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  )
  with check (
    exists (
      select 1 from public.trainers t
      where t.id = trainer_id
        and (
          public.has_org_role(t.organization_id, 'admin'::public.app_role) or
          public.has_org_role(t.organization_id, 'manager'::public.app_role) or
          public.has_org_role(t.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );

-- ---------------------------------------------------------
-- Storage : bucket pour les documents formateurs
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('trainers', 'trainers', false)
on conflict (id) do nothing;

drop policy if exists "trainers_storage_select" on storage.objects;
create policy "trainers_storage_select"
  on storage.objects for select
  using (
    bucket_id = 'trainers'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.is_active
    )
  );

drop policy if exists "trainers_storage_insert" on storage.objects;
create policy "trainers_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'trainers'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.is_active
        and m.role in (
          'admin'::public.app_role,
          'manager'::public.app_role,
          'pedagogy_lead'::public.app_role
        )
    )
  );

drop policy if exists "trainers_storage_update" on storage.objects;
create policy "trainers_storage_update"
  on storage.objects for update
  using (
    bucket_id = 'trainers'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.is_active
        and m.role in (
          'admin'::public.app_role,
          'manager'::public.app_role,
          'pedagogy_lead'::public.app_role
        )
    )
  );

drop policy if exists "trainers_storage_delete" on storage.objects;
create policy "trainers_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'trainers'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.is_active
        and m.role = 'admin'::public.app_role
    )
  );
