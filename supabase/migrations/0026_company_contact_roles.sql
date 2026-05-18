-- =========================================================
-- Migration 0026 : Rôles et préférences de notification
-- pour les contacts entreprise
-- =========================================================
-- Permet d'identifier qui dans l'entreprise reçoit quoi :
--   - RH/admin : documents administratifs (devis, convention, facture)
--   - Manager : informations d'organisation (ouverture, annulation…)
--   - Comptable : factures et règlements
--   - Référent pédagogique : programme, attestations
-- =========================================================

do $$ begin
  create type public.company_contact_role as enum (
    'rh',
    'admin',
    'manager',
    'comptable',
    'referent_pedago',
    'direction',
    'autre'
  );
exception when duplicate_object then null; end $$;

alter table public.company_contacts
  add column if not exists role            public.company_contact_role
    not null default 'autre',
  add column if not exists service         text,
  add column if not exists notify_inscription_validated   boolean not null default false,
  add column if not exists notify_session_opened          boolean not null default false,
  add column if not exists notify_session_cancelled       boolean not null default false,
  add column if not exists notify_session_completed       boolean not null default false,
  add column if not exists notify_admin_documents         boolean not null default false,
  add column if not exists notify_invoices                boolean not null default false,
  add column if not exists notify_certificates            boolean not null default false;

comment on column public.company_contacts.role is
  'Role du contact dans l''entreprise (RH, manager, comptable...).';
comment on column public.company_contacts.service is
  'Service ou departement (ex: RH, Comptabilite, Direction commerciale).';
comment on column public.company_contacts.notify_inscription_validated is
  'Recevoir un email lorsqu''une inscription est validee.';
comment on column public.company_contacts.notify_session_opened is
  'Recevoir un email a l''ouverture d''une session de formation.';
comment on column public.company_contacts.notify_session_cancelled is
  'Recevoir un email en cas d''annulation d''une session.';
comment on column public.company_contacts.notify_session_completed is
  'Recevoir un email quand une session est terminee.';
comment on column public.company_contacts.notify_admin_documents is
  'Recevoir devis, conventions, regroupements administratifs.';
comment on column public.company_contacts.notify_invoices is
  'Recevoir les factures.';
comment on column public.company_contacts.notify_certificates is
  'Recevoir les attestations / certificats des apprenants.';
