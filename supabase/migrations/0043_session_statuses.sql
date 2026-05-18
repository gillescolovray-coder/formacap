-- =========================================================
-- Migration 0043 : Statuts de session personnalisables
-- =========================================================
-- Permet a chaque organisation de definir ses propres statuts
-- de session (libelle, description, couleur, ordre). La table
-- sessions garde son champ `status` (text), qui pointe sur le
-- code unique du statut au sein de l'organisation.
-- Si aucun statut custom n'existe, le code applicatif fait un
-- fallback sur les libelles hardcodes (SESSION_STATUS_LABELS).
-- =========================================================

create table if not exists public.session_statuses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null,                        -- ex: "draft", "planned" ou un slug custom
  label           text not null,
  description     text,
  color           text,                                 -- cle de palette (ex: "amber", "cyan", "rose"...)
  position        int  not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists idx_session_statuses_org
  on public.session_statuses(organization_id);
create index if not exists idx_session_statuses_org_position
  on public.session_statuses(organization_id, position);

create trigger session_statuses_updated_at
  before update on public.session_statuses
  for each row execute function public.set_updated_at();

comment on table public.session_statuses is
  'Statuts de session personnalisables par organisation (libelle, description, couleur, ordre).';

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.session_statuses enable row level security;

create policy "session_statuses_select_org"
  on public.session_statuses for select
  using (public.is_org_member(organization_id));

create policy "session_statuses_insert_admin"
  on public.session_statuses for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role)
  );

create policy "session_statuses_update_admin"
  on public.session_statuses for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role)
  );

create policy "session_statuses_delete_admin"
  on public.session_statuses for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));

-- ---------------------------------------------------------
-- Seed : initialiser les 8 statuts par defaut pour chaque
-- organisation existante (idempotent grace au unique).
-- ---------------------------------------------------------
insert into public.session_statuses (organization_id, code, label, description, color, position)
select o.id, s.code, s.label, s.description, s.color, s.position
from public.organizations o
cross join (values
  ('draft',       'Brouillon',  'Session en cours de saisie. Les informations ne sont pas encore completes ou validees.', 'zinc',   0),
  ('planned',     'Planifiee',  'Session definie (dates, formation, lieu) mais sans engagement ferme - en attente d''un nombre minimum d''inscrits.', 'amber',  10),
  ('confirmed',   'Confirmee',  'Session validee, le seuil de participants est atteint, les convocations peuvent partir.', 'blue',   20),
  ('in_progress', 'En cours',   'Session en train de se derouler entre la date de debut et la date de fin.', 'cyan',   30),
  ('completed',   'Terminee',   'Session achevee. Emargements complets, attestations delivrees, place pour la facturation.', 'violet', 40),
  ('postponed',   'Reportee',   'Session decalee a une date ulterieure. Les inscriptions sont conservees.', 'orange', 50),
  ('cancelled',   'Annulee',    'Session abandonnee avant son debut (manque d''inscrits, indisponibilite formateur, etc.).', 'red',    60),
  ('archived',    'Archivee',   'Session ancienne sortie de la liste active. Reste consultable via son URL.', 'slate',  70)
) as s(code, label, description, color, position)
on conflict (organization_id, code) do nothing;
