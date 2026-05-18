-- =========================================================
-- Migration 0056 : Convention - mode de financement + statut obsolete
-- =========================================================
-- Aligne la base sur les regles metier R1 + R4 validées avec Gilles :
--
--  R1 : Une annulation d'apprenant (sur une session non démarrée)
--       doit invalider la convention. On ajoute le statut 'obsolete'
--       pour la marquer comme à refaire (sans la supprimer pour
--       garder la trace).
--
--  R4 : Le mode de financement est attaché à la convention (et pas
--       à l'entreprise). Une même entreprise peut avoir des
--       conventions de modes différents (OPCO / plan dév / CPF / autre).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Etendre l'enum status pour inclure 'obsolete'
-- ---------------------------------------------------------
alter table public.session_conventions
  drop constraint if exists session_conventions_status_check;

alter table public.session_conventions
  add constraint session_conventions_status_check
  check (status in ('draft', 'sent', 'signed', 'cancelled', 'obsolete'));

comment on column public.session_conventions.status is
  'Statut metier : draft (créée), sent (envoyée RH), signed (signée), cancelled (annulée manuellement), obsolete (apprenants modifiés depuis envoi - a refaire).';

-- ---------------------------------------------------------
-- 2) Ajouter financing_mode
-- ---------------------------------------------------------
alter table public.session_conventions
  add column if not exists financing_mode text
    check (
      financing_mode is null or
      financing_mode in ('opco', 'plan_developpement', 'cpf', 'autofinancement', 'pole_emploi', 'fse', 'region', 'autre')
    );

comment on column public.session_conventions.financing_mode is
  'Mode de financement de la convention : opco / plan_developpement / cpf / autofinancement / pole_emploi / fse / region / autre.';

-- ---------------------------------------------------------
-- 3) Ajouter raison d'obsolescence (pour info admin)
-- ---------------------------------------------------------
alter table public.session_conventions
  add column if not exists obsolete_reason text,
  add column if not exists obsoleted_at timestamptz;

comment on column public.session_conventions.obsolete_reason is
  'Raison automatique de l''obsolescence (ex: "Apprenant X annule le JJ/MM").';
