-- =========================================================
-- Migration 0016 : Compétences structurées des formateurs
-- =========================================================
-- Catalogues personnalisables (domaines + niveaux) par organisation,
-- et table de liaison N:N entre formateurs et couples (domaine, niveau).
-- =========================================================

-- ---------------------------------------------------------
-- Table : skill_domains (catalogue des domaines de compétence)
-- ---------------------------------------------------------
create table if not exists public.skill_domains (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  description     text,
  position        int  not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists idx_skill_domains_org
  on public.skill_domains(organization_id, is_active, position);

drop trigger if exists skill_domains_updated_at on public.skill_domains;
create trigger skill_domains_updated_at
  before update on public.skill_domains
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Table : skill_levels (catalogue des niveaux d'intervention)
-- ---------------------------------------------------------
create table if not exists public.skill_levels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  rank            int  not null default 1,        -- 1 = débutant ... 5 = expert
  color           text,                            -- code couleur indicatif (#hex)
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists idx_skill_levels_org
  on public.skill_levels(organization_id, is_active, rank);

drop trigger if exists skill_levels_updated_at on public.skill_levels;
create trigger skill_levels_updated_at
  before update on public.skill_levels
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Table : trainer_competences (couples domaine + niveau)
-- ---------------------------------------------------------
create table if not exists public.trainer_competences (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  domain_id   uuid not null references public.skill_domains(id) on delete restrict,
  level_id    uuid not null references public.skill_levels(id) on delete restrict,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (trainer_id, domain_id)
);

create index if not exists idx_trainer_competences_trainer
  on public.trainer_competences(trainer_id);
create index if not exists idx_trainer_competences_domain
  on public.trainer_competences(domain_id);
create index if not exists idx_trainer_competences_level
  on public.trainer_competences(level_id);

-- ---------------------------------------------------------
-- RLS : skill_domains
-- ---------------------------------------------------------
alter table public.skill_domains enable row level security;

drop policy if exists "skill_domains_select_org" on public.skill_domains;
create policy "skill_domains_select_org"
  on public.skill_domains for select
  using (public.is_org_member(organization_id));

drop policy if exists "skill_domains_modify" on public.skill_domains;
create policy "skill_domains_modify"
  on public.skill_domains for all
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
-- RLS : skill_levels
-- ---------------------------------------------------------
alter table public.skill_levels enable row level security;

drop policy if exists "skill_levels_select_org" on public.skill_levels;
create policy "skill_levels_select_org"
  on public.skill_levels for select
  using (public.is_org_member(organization_id));

drop policy if exists "skill_levels_modify" on public.skill_levels;
create policy "skill_levels_modify"
  on public.skill_levels for all
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
-- RLS : trainer_competences (cascade via trainer)
-- ---------------------------------------------------------
alter table public.trainer_competences enable row level security;

drop policy if exists "trainer_competences_select_org" on public.trainer_competences;
create policy "trainer_competences_select_org"
  on public.trainer_competences for select
  using (
    exists (
      select 1 from public.trainers t
      where t.id = trainer_id
        and public.is_org_member(t.organization_id)
    )
  );

drop policy if exists "trainer_competences_modify" on public.trainer_competences;
create policy "trainer_competences_modify"
  on public.trainer_competences for all
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
-- Pré-remplissage : niveaux + quelques domaines pour CHAQUE
-- organisation existante qui n'a pas encore de catalogue.
-- ---------------------------------------------------------
insert into public.skill_levels (organization_id, name, rank, color)
select o.id, lvl.name, lvl.rank, lvl.color
from public.organizations o
cross join (values
  ('Débutant',       1, '#94a3b8'),
  ('Intermédiaire',  2, '#06b6d4'),
  ('Avancé',         3, '#0284c7'),
  ('Expert',         4, '#7c3aed')
) as lvl(name, rank, color)
where not exists (
  select 1 from public.skill_levels sl
  where sl.organization_id = o.id and sl.name = lvl.name
);

insert into public.skill_domains (organization_id, name, position)
select o.id, dom.name, dom.position
from public.organizations o
cross join (values
  ('Bureautique',                 10),
  ('Numérique & informatique',    20),
  ('Marchés publics',             30),
  ('BTP',                         40),
  ('Sécurité au travail',         50),
  ('Management',                  60),
  ('Communication',               70),
  ('Comptabilité - gestion',      80)
) as dom(name, position)
where not exists (
  select 1 from public.skill_domains sd
  where sd.organization_id = o.id and sd.name = dom.name
);
