-- Migration 0112 : Refonte du modele de tarification / facturation
-- Date : 2026-05-31
-- Auteur : Gilles + Claude (refonte concertee suite a confusion
--          entre cas Direct / OF achete places / Prescripteur /
--          CAP sous-traite pour OF).
--
-- OBJECTIFS :
--
-- 1. Ajouter sur `companies` les tarifs de SOUS-TRAITANCE (CAP NUMERIQUE
--    sous-traite la prestation pour cet OF organisateur — forfait
--    journalier independant du nombre d apprenants) avec 2 modalites
--    (distanciel / presentiel).
--
-- 2. Ajouter sur `companies` les champs de COMMISSION PRESCRIPTEUR
--    (cas 2b avec remuneration) : taux % OU forfait fixe.
--
-- 3. Ajouter sur `sessions` un lien vers l OF organisateur dans le cas
--    ou CAP NUMERIQUE est le sous-traitant (cas 3).
--
-- 4. Ajouter sur `inscription_requests` un bloc FACTURATION explicite :
--    qui est facture, combien, mode de calcul, override manuel
--    possible. C est l ETAT FIGE de la facturation pour cette
--    inscription (Source de Verite stockee — pas un calcul a la
--    volee). Le helper computeBillingForInscription() proposera
--    une valeur par defaut intelligente a la creation ;
--    l utilisateur pourra modifier a la main sans que le systeme
--    recalcule par-dessus.
--
-- 5. Marquer `partner_quiz_unit_price_ht` comme LEGACY (a supprimer
--    dans une migration ulterieure, apres adaptation complete du code).
--
-- IMPORTANT : tout est NULLABLE / sans default contraignant pour ne
-- pas casser les donnees existantes. Le backfill se fera dans une
-- etape Node (helper compute + script) apres deploiement.

-- ============================================================
-- 1) COMPANIES — tarifs sous-traitance + commission prescripteur
-- ============================================================

alter table public.companies
  add column if not exists subcontracting_daily_rate_distanciel_ht numeric(10,2)
    check (subcontracting_daily_rate_distanciel_ht is null
           or subcontracting_daily_rate_distanciel_ht >= 0);

alter table public.companies
  add column if not exists subcontracting_daily_rate_presentiel_ht numeric(10,2)
    check (subcontracting_daily_rate_presentiel_ht is null
           or subcontracting_daily_rate_presentiel_ht >= 0);

comment on column public.companies.subcontracting_daily_rate_distanciel_ht is
  'CAS 3 (sous-traitance) : tarif HT par JOUR (forfait independant du nb apprenants) que CAP NUMERIQUE facture a cet OF quand CAP est sous-traitant d une formation DISTANCIEL organisee par cet OF. Migration 0112.';

comment on column public.companies.subcontracting_daily_rate_presentiel_ht is
  'CAS 3 (sous-traitance) : tarif HT par JOUR (forfait independant du nb apprenants) que CAP NUMERIQUE facture a cet OF quand CAP est sous-traitant d une formation PRESENTIEL organisee par cet OF. Migration 0112.';

-- Commission prescripteur (cas 2b avec remuneration). Les deux champs
-- sont alternatifs : soit un taux %, soit un forfait fixe. La logique
-- metier (cote app) choisira selon ce qui est rempli. Si les deux
-- sont remplis, on additionnera (rare, mais possible).
alter table public.companies
  add column if not exists prescripteur_commission_rate_pct numeric(5,2)
    check (prescripteur_commission_rate_pct is null
           or (prescripteur_commission_rate_pct >= 0
               and prescripteur_commission_rate_pct <= 100));

alter table public.companies
  add column if not exists prescripteur_commission_flat_ht numeric(10,2)
    check (prescripteur_commission_flat_ht is null
           or prescripteur_commission_flat_ht >= 0);

comment on column public.companies.prescripteur_commission_rate_pct is
  'CAS 2b (prescripteur remunere) : pourcentage du CA HT verse au prescripteur en commission (ex : 10 pour 10%). Cumulable avec prescripteur_commission_flat_ht. Migration 0112.';

comment on column public.companies.prescripteur_commission_flat_ht is
  'CAS 2b (prescripteur remunere) : forfait fixe HT verse au prescripteur PAR INSCRIPTION confirmee. Cumulable avec prescripteur_commission_rate_pct. Migration 0112.';

-- Legacy : on ne supprime PAS partner_quiz_unit_price_ht ici (donnees
-- a migrer d abord). On met juste un commentaire pour signaler.
comment on column public.companies.partner_quiz_unit_price_ht is
  'LEGACY (a supprimer apres adaptation du code, migration future). Ancien forfait quiz par apprenant pour OF, remplace par le nouveau systeme de billing explicite par inscription. Migration 0087 -> deprecate en 0112.';

-- ============================================================
-- 2) SESSIONS — OF organisateur en cas de sous-traitance
-- ============================================================

alter table public.sessions
  add column if not exists subcontracting_company_id uuid
    references public.companies(id) on delete set null;

comment on column public.sessions.subcontracting_company_id is
  'CAS 3 (sous-traitance) : FK vers l OF ORGANISATEUR de la session quand CAP NUMERIQUE est sous-traitant (CAP preste, l OF facture son client final). NULL = session organisee directement par CAP. Migration 0112.';

create index if not exists sessions_subcontracting_company_id_idx
  on public.sessions (subcontracting_company_id)
  where subcontracting_company_id is not null;

-- ============================================================
-- 3) INSCRIPTION_REQUESTS — bloc FACTURATION explicite (Q2 OUI)
-- ============================================================

-- Qui est le payeur (qui CAP facture pour cette inscription).
-- Par defaut = company_id de l inscription (entreprise apprenant)
-- mais peut etre modifie (ex : prescripteur paye au lieu de son
-- client final, ou OF organisateur paye en cas de sous-traitance).
alter table public.inscription_requests
  add column if not exists billing_target_company_id uuid
    references public.companies(id) on delete restrict;

comment on column public.inscription_requests.billing_target_company_id is
  'Qui CAP NUMERIQUE facture pour cette inscription. Defaut auto = entreprise apprenant. Modifiable manuellement. Migration 0112.';

-- Mode de calcul (impact sur la formule)
alter table public.inscription_requests
  add column if not exists billing_pricing_mode text
    check (billing_pricing_mode is null
           or billing_pricing_mode in (
              'per_day_per_learner',  -- tarif jour x nb jours x 1 (par inscription, multiplie cote agrege par nb apprenants)
              'flat_per_day',         -- forfait journalier (independant du nb apprenants — CAS 3)
              'flat'                  -- forfait global (forfait unique)
           ));

comment on column public.inscription_requests.billing_pricing_mode is
  'Mode de tarification figeee a la creation de l inscription : per_day_per_learner (CAS 1/2a/2b classiques), flat_per_day (CAS 3 sous-traitance), flat (forfait global). Migration 0112.';

-- Tarif unitaire HT (interpretation depend du mode)
alter table public.inscription_requests
  add column if not exists billing_unit_price_ht numeric(10,2)
    check (billing_unit_price_ht is null or billing_unit_price_ht >= 0);

comment on column public.inscription_requests.billing_unit_price_ht is
  'Tarif unitaire HT figeee : en mode per_day_per_learner = tarif par jour et par apprenant ; en mode flat_per_day = forfait par jour ; en mode flat = total. Migration 0112.';

-- Total HT (cache de calcul OU override manuel).
alter table public.inscription_requests
  add column if not exists billing_total_ht numeric(10,2)
    check (billing_total_ht is null or billing_total_ht >= 0);

comment on column public.inscription_requests.billing_total_ht is
  'Montant total HT figeee a facturer pour cette inscription. Calcule a la creation depuis billing_unit_price_ht x duree. Modifiable a la main. Migration 0112.';

-- Indicateur : tarif modifie manuellement (le systeme ne doit pas
-- recalculer par-dessus).
alter table public.inscription_requests
  add column if not exists billing_manually_overridden boolean
    not null default false;

comment on column public.inscription_requests.billing_manually_overridden is
  'True si Gilles (ou un admin) a modifie manuellement le billing_total_ht. Empeche le helper de recalculer par-dessus. Migration 0112.';

-- Notes facturation (raison override, conditions speciales)
alter table public.inscription_requests
  add column if not exists billing_notes text;

comment on column public.inscription_requests.billing_notes is
  'Notes facturation libres (raison d un prix exceptionnel, conditions de paiement, etc.). Visible dans l UI de la fiche inscription. Migration 0112.';

-- Index pratique : retrouver toutes les inscriptions a facturer pour
-- une entreprise donnee.
create index if not exists inscription_requests_billing_target_idx
  on public.inscription_requests (billing_target_company_id)
  where billing_target_company_id is not null;

-- ============================================================
-- 4) RLS — pas de changement (les nouvelles colonnes heritent
--    automatiquement des policies existantes sur les 3 tables).
-- ============================================================

-- Aucune nouvelle policy a creer : les colonnes ajoutees sont
-- couvertes par les policies org-scoped existantes (companies,
-- sessions, inscription_requests).

-- ============================================================
-- 5) NOTES BACKFILL (a executer cote Node apres deploiement)
-- ============================================================

-- Le backfill des champs billing_* sur les inscriptions existantes
-- sera fait par un script Node qui appellera computeBillingForInscription()
-- sur chaque inscription confirmee (status != cancelled) et stockera
-- le resultat. Ce n est PAS fait ici en SQL car la logique de cascade
-- (override -> company specific -> defaults -> legacy fallback) est
-- complexe et evolue. Le script de backfill sera fourni separement.

-- FIN Migration 0112
