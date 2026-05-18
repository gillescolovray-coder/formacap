-- =========================================================
-- Migration 0025 : Module de gestion des inscriptions
-- =========================================================
-- Objectif :
--   - Capturer les demandes d'inscription (web/email/téléphone…)
--   - Workflow d'étapes personnalisable par l'organisme
--   - Modèles d'emails personnalisables
--   - Traçabilité complète (timeline) pour Qualiopi
--   - Gestion du handicap, du multi-financement, des documents
-- =========================================================

-- ---------------------------------------------------------
-- Table : workflow_stages — étapes du parcours d'inscription
-- (ex: Nouvelle demande, À qualifier, Devis envoyé, Convention signée…)
-- ---------------------------------------------------------
create table if not exists public.inscription_stages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key             text not null,         -- identifiant stable (ex: 'new', 'quote_sent')
  name            text not null,         -- libellé affiché
  color           text,                   -- couleur indicative #RRGGBB
  position        int  not null default 0,
  is_initial      boolean not null default false,
  is_terminal     boolean not null default false,
  is_won          boolean not null default false,  -- inscription confirmée (gagnée)
  is_lost         boolean not null default false,  -- inscription perdue (refus, abandon)
  description     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, key)
);
create index if not exists idx_inscription_stages_org
  on public.inscription_stages(organization_id, position);
drop trigger if exists inscription_stages_updated_at on public.inscription_stages;
create trigger inscription_stages_updated_at
  before update on public.inscription_stages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Type enum : source du lead
-- ---------------------------------------------------------
do $$ begin
  create type public.inscription_source as enum (
    'web_form',
    'email',
    'phone',
    'salon',
    'recommandation',
    'partenaire',
    'autre'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------
-- Type enum : mode de financement
-- ---------------------------------------------------------
do $$ begin
  create type public.financing_mode as enum (
    'cpf',
    'opco',
    'employeur',
    'autofinancement',
    'france_travail',
    'aif',
    'aide_region',
    'mixte',
    'autre'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------
-- Table : inscription_requests — demandes d'inscription
-- ---------------------------------------------------------
create table if not exists public.inscription_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Référence interne (ex: INSC-2026-001)
  reference       text,

  -- Source du lead
  source          public.inscription_source not null default 'email',
  source_details  text,            -- ex: "Formulaire site cap-numerique.fr"

  -- Personne (lead) — soit un apprenant existant, soit prospect
  learner_id      uuid references public.learners(id) on delete set null,
  prospect_first_name text,
  prospect_last_name  text,
  prospect_email      text,
  prospect_phone      text,
  prospect_birth_date date,

  -- Entreprise (pour B2B)
  company_id      uuid references public.companies(id) on delete set null,
  company_name_freetext text,      -- si pas encore en base

  -- Cible
  target_session_id   uuid references public.sessions(id) on delete set null,
  target_parcours_id  uuid references public.parcours(id) on delete set null,
  target_formation_id uuid references public.formations(id) on delete set null,

  -- Financement
  financing_mode      public.financing_mode default 'autofinancement',
  financing_details   text,        -- nom OPCO, code AIF…
  quote_amount_ht     numeric(10,2),

  -- Handicap (Qualiopi indic. 19)
  has_special_needs       boolean not null default false,
  special_needs_details   text,
  handicap_referent_notified boolean not null default false,

  -- Documents préalables envoyés (Qualiopi indic. 4)
  pre_info_sent           boolean not null default false,
  pre_info_sent_at        timestamptz,

  -- Workflow
  stage_id        uuid references public.inscription_stages(id) on delete set null,
  assigned_to     uuid references public.profiles(id) on delete set null,

  -- Dates clés (auto-remplies par les transitions)
  received_at     timestamptz not null default now(),
  qualified_at    timestamptz,
  quote_sent_at   timestamptz,
  contract_signed_at timestamptz,
  convocation_sent_at timestamptz,
  closed_at       timestamptz,

  -- Préférences communication
  contact_preference text default 'email',  -- email/phone/sms

  -- Texte libre / message reçu
  request_message  text,
  notes_internal   text,
  tags             text[],

  -- Liens externes
  consent_rgpd_at  timestamptz,             -- horodatage de l'acceptation RGPD

  -- Documents joints (devis, convention, etc.)
  documents       jsonb not null default '[]'::jsonb,

  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_inscription_requests_org
  on public.inscription_requests(organization_id, stage_id);
create index if not exists idx_inscription_requests_session
  on public.inscription_requests(target_session_id);
create index if not exists idx_inscription_requests_assigned
  on public.inscription_requests(assigned_to);
create index if not exists idx_inscription_requests_received
  on public.inscription_requests(received_at desc);
drop trigger if exists inscription_requests_updated_at on public.inscription_requests;
create trigger inscription_requests_updated_at
  before update on public.inscription_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Table : inscription_events — historique (timeline, traçabilité Qualiopi)
-- ---------------------------------------------------------
create table if not exists public.inscription_events (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.inscription_requests(id) on delete cascade,
  event_type      text not null,    -- created, stage_changed, email_sent, document_added, note_added…
  from_stage_id   uuid references public.inscription_stages(id),
  to_stage_id     uuid references public.inscription_stages(id),
  payload         jsonb not null default '{}'::jsonb,  -- détails (sujet email, nom doc, message…)
  actor_id        uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_inscription_events_request
  on public.inscription_events(request_id, created_at desc);

-- ---------------------------------------------------------
-- Table : inscription_email_templates — modèles personnalisables
-- ---------------------------------------------------------
create table if not exists public.inscription_email_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key             text not null,    -- ex: 'quote', 'convocation', 'reminder_quote'
  name            text not null,
  subject         text not null,
  body            text not null,    -- markdown ou HTML simple
  trigger_stage_key text,           -- déclenchement automatique sur cette étape (optionnel)
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, key)
);
create index if not exists idx_email_templates_org
  on public.inscription_email_templates(organization_id, is_active);
drop trigger if exists inscription_email_templates_updated_at
  on public.inscription_email_templates;
create trigger inscription_email_templates_updated_at
  before update on public.inscription_email_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- RLS : inscription_stages
-- ---------------------------------------------------------
alter table public.inscription_stages enable row level security;
drop policy if exists "inscription_stages_select_org" on public.inscription_stages;
create policy "inscription_stages_select_org"
  on public.inscription_stages for select
  using (public.is_org_member(organization_id));
drop policy if exists "inscription_stages_modify" on public.inscription_stages;
create policy "inscription_stages_modify"
  on public.inscription_stages for all
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  )
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

-- ---------------------------------------------------------
-- RLS : inscription_requests
-- ---------------------------------------------------------
alter table public.inscription_requests enable row level security;
drop policy if exists "inscription_requests_select_org" on public.inscription_requests;
create policy "inscription_requests_select_org"
  on public.inscription_requests for select
  using (public.is_org_member(organization_id));
drop policy if exists "inscription_requests_modify" on public.inscription_requests;
create policy "inscription_requests_modify"
  on public.inscription_requests for all
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  )
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

-- ---------------------------------------------------------
-- RLS : inscription_events (cascade via la demande)
-- ---------------------------------------------------------
alter table public.inscription_events enable row level security;
drop policy if exists "inscription_events_select_org" on public.inscription_events;
create policy "inscription_events_select_org"
  on public.inscription_events for select
  using (
    exists (
      select 1 from public.inscription_requests r
      where r.id = request_id
        and public.is_org_member(r.organization_id)
    )
  );
drop policy if exists "inscription_events_insert" on public.inscription_events;
create policy "inscription_events_insert"
  on public.inscription_events for insert
  with check (
    exists (
      select 1 from public.inscription_requests r
      where r.id = request_id
        and (
          public.has_org_role(r.organization_id, 'admin'::public.app_role) or
          public.has_org_role(r.organization_id, 'manager'::public.app_role) or
          public.has_org_role(r.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );

-- ---------------------------------------------------------
-- RLS : inscription_email_templates
-- ---------------------------------------------------------
alter table public.inscription_email_templates enable row level security;
drop policy if exists "email_templates_select_org" on public.inscription_email_templates;
create policy "email_templates_select_org"
  on public.inscription_email_templates for select
  using (public.is_org_member(organization_id));
drop policy if exists "email_templates_modify" on public.inscription_email_templates;
create policy "email_templates_modify"
  on public.inscription_email_templates for all
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  )
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

-- ---------------------------------------------------------
-- Pré-remplissage : workflow standard pour chaque organisation
-- ---------------------------------------------------------
insert into public.inscription_stages
  (organization_id, key, name, color, position, is_initial, is_terminal, is_won, is_lost, description)
select o.id, v.key, v.name, v.color, v.position, v.is_initial, v.is_terminal, v.is_won, v.is_lost, v.description
from public.organizations o
cross join (values
  ('new',            'Nouvelle demande',     '#94a3b8',  10, true,  false, false, false, 'Demande reçue, à qualifier.'),
  ('to_qualify',     'À qualifier',          '#06b6d4',  20, false, false, false, false, 'Premier contact à établir, prérequis à valider.'),
  ('pre_info_sent',  'Infos préalables envoyées', '#0284c7', 30, false, false, false, false, 'Programme, modalités, prérequis transmis (Qualiopi indic. 4).'),
  ('quote_sent',     'Devis envoyé',         '#f59e0b',  40, false, false, false, false, 'Devis envoyé, en attente de retour.'),
  ('contract_signed','Convention signée',    '#7c3aed',  50, false, false, false, false, 'Engagement réciproque signé (indic. 9).'),
  ('convoked',       'Convoqué',             '#0ea5e9',  60, false, false, false, false, 'Convocation envoyée à l''apprenant.'),
  ('confirmed',      'Confirmé',             '#10b981',  70, false, true,  true,  false, 'Inscription définitive — apprenant ajouté à la session.'),
  ('cancelled',      'Annulé',               '#ef4444',  90, false, true,  false, true,  'Annulation avant démarrage.'),
  ('refused',        'Refusé',               '#dc2626',  91, false, true,  false, true,  'Demande refusée par l''OF (prérequis non remplis…).'),
  ('lost',           'Perdu',                '#71717a', 100, false, true,  false, true,  'Pas de réponse / lead froid.')
) as v(key, name, color, position, is_initial, is_terminal, is_won, is_lost, description)
where not exists (
  select 1 from public.inscription_stages s
  where s.organization_id = o.id and s.key = v.key
);

-- ---------------------------------------------------------
-- Pré-remplissage : modèles d'emails de base
-- ---------------------------------------------------------
insert into public.inscription_email_templates
  (organization_id, key, name, subject, body, trigger_stage_key)
select o.id, v.key, v.name, v.subject, v.body, v.trigger_stage_key
from public.organizations o
cross join (values
  ('pre_info', 'Informations préalables (Qualiopi indic. 4)',
   'Votre demande de formation - Informations détaillées',
   'Bonjour {{prenom}} {{nom}},

Suite à votre demande d''inscription à la formation "{{formation}}", nous vous transmettons en pièces jointes :
- le programme détaillé,
- les modalités pédagogiques,
- les prérequis,
- les conditions tarifaires.

Pour toute question, nous restons à votre disposition.

Cordialement,
L''équipe {{organisme}}',
   'pre_info_sent'),

  ('quote', 'Envoi de devis',
   'Devis pour la formation "{{formation}}"',
   'Bonjour {{prenom}} {{nom}},

Veuillez trouver en pièce jointe le devis correspondant à votre demande pour la formation "{{formation}}".

Montant proposé : {{montant_ht}} € HT.

Ce devis est valable 30 jours. Pour valider votre inscription, merci de nous retourner le devis signé et la convention complétée.

Cordialement,
L''équipe {{organisme}}',
   'quote_sent'),

  ('convocation', 'Convocation à la session',
   'Convocation - Formation "{{formation}}"',
   'Bonjour {{prenom}} {{nom}},

Nous avons le plaisir de vous confirmer votre inscription à la formation "{{formation}}".

Dates : {{date_debut}} au {{date_fin}}
Horaires : {{horaires}}
Lieu : {{lieu}}
Formateur : {{formateur}}

Vous trouverez en pièce jointe la convocation détaillée et le règlement intérieur.

À bientôt,
L''équipe {{organisme}}',
   'convoked'),

  ('handicap_followup', 'Suivi besoin spécifique',
   'Adaptation de la formation - Étude de votre besoin',
   'Bonjour {{prenom}} {{nom}},

Vous avez signalé un besoin spécifique pour suivre la formation "{{formation}}".

Notre référent handicap, {{referent_handicap}}, va vous contacter sous 48h pour étudier ensemble les adaptations possibles.

Cordialement,
L''équipe {{organisme}}',
   null)
) as v(key, name, subject, body, trigger_stage_key)
where not exists (
  select 1 from public.inscription_email_templates t
  where t.organization_id = o.id and t.key = v.key
);
