-- =========================================================
-- Migration 0001 : identité, organisations et rôles
-- =========================================================
-- Objectif : poser les fondations du cloisonnement multi-organisations
-- et multi-rôles imposé par le cahier des charges (§5 et §9).
--
-- Tables créées :
--   - organizations       : CAP NUMÉRIQUE + formateurs avec catalogue propre
--   - profiles            : infos publiques des utilisateurs (liées à auth.users)
--   - organization_members: qui appartient à quelle orga, avec quel rôle
-- =========================================================

-- Extensions nécessaires
create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- Table: organizations
-- Représente une entité productrice de formations.
-- type = 'main' pour CAP NUMÉRIQUE, 'trainer' pour un formateur
-- ayant son propre catalogue cloisonné.
-- ---------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  type          text not null check (type in ('main', 'trainer')),
  siret         text,
  nda           text,  -- Numéro de Déclaration d'Activité
  address       text,
  postal_code   text,
  city          text,
  country       text default 'France',
  email         text,
  phone         text,
  website       text,
  logo_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table  public.organizations is 'Entités (CAP NUMÉRIQUE + formateurs avec catalogue propre)';
comment on column public.organizations.type is '''main'' = organisme principal, ''trainer'' = formateur indépendant';
comment on column public.organizations.nda is 'Numéro de Déclaration d''Activité (Qualiopi)';

-- ---------------------------------------------------------
-- Table: profiles
-- 1-to-1 avec auth.users de Supabase.
-- Stocke les infos métier (nom, prénom, téléphone, etc.).
-- ---------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  first_name    text,
  last_name     text,
  phone         text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Infos publiques des utilisateurs, liées à auth.users';

-- ---------------------------------------------------------
-- Enum: app_role
-- Liste des rôles applicatifs issue du cahier des charges §4.
-- ---------------------------------------------------------
create type public.app_role as enum (
  'admin',            -- Administrateur technique
  'manager',          -- Gestionnaire de formation
  'pedagogy_lead',    -- Responsable pédagogique / Direction
  'trainer',          -- Formateur
  'company_contact',  -- Contact entreprise cliente
  'learner'           -- Apprenant / stagiaire
);

-- ---------------------------------------------------------
-- Table: organization_members
-- Qui appartient à quelle organisation, avec quel rôle.
-- Un même profil peut être membre de plusieurs organisations
-- et avoir plusieurs rôles dans chacune (ex: un formateur qui
-- anime pour CAP ET pour son propre catalogue).
-- ---------------------------------------------------------
create table public.organization_members (
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  role             public.app_role not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  primary key (organization_id, profile_id, role)
);

create index idx_org_members_profile on public.organization_members(profile_id) where is_active;
create index idx_org_members_org     on public.organization_members(organization_id) where is_active;

comment on table public.organization_members is 'Appartenance profile <-> organization avec rôle applicatif';

-- =========================================================
-- Trigger : création automatique du profile à l'inscription
-- Quand Supabase crée un utilisateur dans auth.users,
-- on crée la ligne correspondante dans public.profiles.
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- Fonctions d'aide pour les politiques RLS
-- (évite la récursion sur organization_members)
-- =========================================================
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org
      and profile_id = auth.uid()
      and is_active
  );
$$;

create or replace function public.has_org_role(org uuid, required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org
      and profile_id = auth.uid()
      and role = required_role
      and is_active
  );
$$;

-- =========================================================
-- Row Level Security
-- =========================================================
alter table public.organizations          enable row level security;
alter table public.profiles               enable row level security;
alter table public.organization_members   enable row level security;

-- profiles : chacun voit et édite son propre profil
create policy "profiles_select_self"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_self"
  on public.profiles for update
  using (auth.uid() = id);

-- organizations : on voit les orgas auxquelles on appartient
create policy "organizations_select_member"
  on public.organizations for select
  using (public.is_org_member(id));

-- organization_members : on voit sa propre appartenance
-- + on voit les autres membres des orgas dont on fait partie
create policy "org_members_select_self"
  on public.organization_members for select
  using (profile_id = auth.uid());

create policy "org_members_select_same_org"
  on public.organization_members for select
  using (public.is_org_member(organization_id));

-- =========================================================
-- Seed : création de l'organisation principale CAP NUMÉRIQUE
-- =========================================================
insert into public.organizations (name, slug, type, email)
values ('CAP NUMÉRIQUE', 'cap-numerique', 'main', 'contact@capnumerique.com')
on conflict (slug) do nothing;
