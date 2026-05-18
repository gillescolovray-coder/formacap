-- =========================================================
-- Migration 0088 : Visibilité catalogue partenaire (prescripteur)
-- =========================================================
-- Un prescripteur peut voir dans son portail :
--   1) Le catalogue distanciel INTER public de CAP NUMÉRIQUE
--      (toggle `partner_portal_show_inter_catalog`, true par défaut).
--   2) Ses sessions INTRA présentiel rattachées par l'admin
--      (toggle `partner_portal_show_own_intra`, true par défaut).
--
-- Le rattachement d'une session INTRA à un prescripteur se fait via
-- la nouvelle colonne `sessions.prescriber_company_id`.
--
-- Cette migration N'AFFECTE PAS les OF partenaires (pour eux,
-- seul le catalogue distanciel INTER reste pertinent — workflow
-- quiz-only). Les toggles sont juste ignorés côté UI quand
-- companies.type = 'of'.
-- =========================================================

alter table public.companies
  add column if not exists partner_portal_show_inter_catalog boolean
    not null default true;

alter table public.companies
  add column if not exists partner_portal_show_own_intra boolean
    not null default true;

comment on column public.companies.partner_portal_show_inter_catalog is
  'PRESCRIPTEUR : afficher le catalogue distanciel INTER public de CAP NUMÉRIQUE dans son portail. Migration 0088.';

comment on column public.companies.partner_portal_show_own_intra is
  'PRESCRIPTEUR : afficher dans son portail les sessions INTRA où il est référent (sessions.prescriber_company_id). Migration 0088.';

-- ---------------------------------------------------------
-- Rattachement d'une session à un prescripteur référent
-- (typiquement une session INTRA "sur mesure" pour ce prescripteur).
-- ---------------------------------------------------------
alter table public.sessions
  add column if not exists prescriber_company_id uuid
    references public.companies(id) on delete set null;

create index if not exists idx_sessions_prescriber
  on public.sessions(prescriber_company_id);

comment on column public.sessions.prescriber_company_id is
  'Entreprise prescriptrice référente pour cette session (typiquement INTRA dédiée). Rend la session visible dans le portail de ce prescripteur. Migration 0088.';
