-- =========================================================
-- Migration 0086 : Portail Partenaire (OF / Prescripteurs)
-- =========================================================
-- Permet à une entreprise de type `of` ou `prescripteur` d'accéder
-- à un mini-marketplace privé sur `/partenaire/<token>` pour :
--   1) consulter le catalogue distanciel INTER de CAP NUMÉRIQUE
--   2) voir ses tarifs négociés (par formation)
--   3) inscrire ses apprenants en autonomie (auto-accepté)
--
-- 2 tables nouvelles :
--   - partner_portal_tokens : 1 token persistant par company
--   - partner_pricing       : tarif HT par (company, formation)
-- =========================================================

-- ---------------------------------------------------------
-- 1) Token portail partenaire
-- ---------------------------------------------------------
create table if not exists public.partner_portal_tokens (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null unique
                references public.companies(id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);

create index if not exists idx_partner_portal_tokens_token
  on public.partner_portal_tokens(token);

comment on table public.partner_portal_tokens is
  'Token persistant par entreprise partenaire (OF/prescripteur) pour l''accès au portail /partenaire/<token>. Migration 0086.';

alter table public.partner_portal_tokens enable row level security;

drop policy if exists "partner_portal_tokens_select_public_via_token"
  on public.partner_portal_tokens;
create policy "partner_portal_tokens_select_public_via_token"
  on public.partner_portal_tokens for select
  using (true);

drop policy if exists "partner_portal_tokens_modify_authorized"
  on public.partner_portal_tokens;
create policy "partner_portal_tokens_modify_authorized"
  on public.partner_portal_tokens for all
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and (
        public.has_org_role(c.organization_id, 'admin'::public.app_role) or
        public.has_org_role(c.organization_id, 'manager'::public.app_role)
      )
    )
  )
  with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id and (
        public.has_org_role(c.organization_id, 'admin'::public.app_role) or
        public.has_org_role(c.organization_id, 'manager'::public.app_role)
      )
    )
  );

-- ---------------------------------------------------------
-- 2) Tarifs négociés par partenaire × formation
-- ---------------------------------------------------------
create table if not exists public.partner_pricing (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null
                    references public.companies(id) on delete cascade,
  formation_id    uuid not null
                    references public.formations(id) on delete cascade,
  unit_price_ht   numeric(10,2) not null check (unit_price_ht >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, formation_id)
);

create index if not exists idx_partner_pricing_company
  on public.partner_pricing(company_id);
create index if not exists idx_partner_pricing_formation
  on public.partner_pricing(formation_id);

comment on table public.partner_pricing is
  'Tarif HT négocié pour un partenaire (OF/prescripteur) sur une formation donnée. Migration 0086.';

alter table public.partner_pricing enable row level security;

-- SELECT public via token : le portail (service_role) lit librement,
-- mais on autorise aussi SELECT pour les membres de l''org propriétaire.
drop policy if exists "partner_pricing_select_org_or_public"
  on public.partner_pricing;
create policy "partner_pricing_select_org_or_public"
  on public.partner_pricing for select
  using (true);

drop policy if exists "partner_pricing_modify_authorized"
  on public.partner_pricing;
create policy "partner_pricing_modify_authorized"
  on public.partner_pricing for all
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and (
        public.has_org_role(c.organization_id, 'admin'::public.app_role) or
        public.has_org_role(c.organization_id, 'manager'::public.app_role)
      )
    )
  )
  with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id and (
        public.has_org_role(c.organization_id, 'admin'::public.app_role) or
        public.has_org_role(c.organization_id, 'manager'::public.app_role)
      )
    )
  );

-- Trigger updated_at automatique
create or replace function public.tg_partner_pricing_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_partner_pricing_updated_at on public.partner_pricing;
create trigger trg_partner_pricing_updated_at
  before update on public.partner_pricing
  for each row execute function public.tg_partner_pricing_set_updated_at();

-- ---------------------------------------------------------
-- 3) Traçabilité sur inscription_requests
-- ---------------------------------------------------------
-- On ajoute :
--   * referrer_company_id : entreprise référente (le partenaire qui a
--     soumis l''inscription, distincte de company_id qui reste celle
--     de l''apprenant).
--   * via_partner_portal  : flag explicite pour distinguer les
--     inscriptions soumises via /partenaire/<token>.
alter table public.inscription_requests
  add column if not exists referrer_company_id uuid
    references public.companies(id) on delete set null;

alter table public.inscription_requests
  add column if not exists via_partner_portal boolean not null default false;

create index if not exists idx_inscription_requests_referrer
  on public.inscription_requests(referrer_company_id);

comment on column public.inscription_requests.referrer_company_id is
  'Entreprise référente (partenaire OF/prescripteur) qui a soumis l''inscription. Migration 0086.';
comment on column public.inscription_requests.via_partner_portal is
  'TRUE si l''inscription a été soumise via /partenaire/<token>. Migration 0086.';
