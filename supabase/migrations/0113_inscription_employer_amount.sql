-- Migration 0113 : Decomposition financement OPCO + Employeur
-- Date : 2026-06-01
-- Auteur : Gilles + Claude
--
-- OBJECTIF (decide 2026-05-24, implemente 2026-06-01) :
-- Permettre de tracer pour chaque inscription la repartition du
-- financement entre :
--   - les accords OPCO (table inscription_opco_fundings, deja en place)
--   - la part restant a charge de l employeur (NOUVEAU champ)
--
-- Total HT d une inscription = Σ(inscription_opco_fundings.amount_ht)
--                            + inscription_requests.employer_amount_ht
--
-- Exemple concret (Mme DA SILVA, session 26/05/2026) :
--   - OPCO Constructys : 168,00 € HT
--   - Employeur (reste a charge) : 172,00 € HT
--   - Total HT : 340,00 €
--
-- NOTE : ce nouveau champ ne REMPLACE pas billing_total_ht (migration
-- 0112). Les 2 coexistent :
--   - billing_total_ht (0112) = SOURCE DE VERITE du total a facturer
--   - employer_amount_ht (0113) = DECOMPOSITION de la part employeur
-- L invariant business : billing_total_ht = Σ(OPCO) + employer_amount_ht.
-- C est au helper computeInscriptionTotalHt de maintenir cet invariant.

alter table public.inscription_requests
  add column if not exists employer_amount_ht numeric(10,2)
    check (employer_amount_ht is null or employer_amount_ht >= 0);

comment on column public.inscription_requests.employer_amount_ht is
  'Part HT a la charge de l employeur pour cette inscription. Sert avec inscription_opco_fundings.amount_ht a decomposer billing_total_ht en (OPCO + Employeur). Calculee auto par defaut (= billing_total_ht - Σ OPCO) ou saisie manuellement par admin. Migration 0113 — 2026-06-01.';

-- Index pratique : recherche des inscriptions ayant une part employeur
-- non nulle (= a facturer).
create index if not exists inscription_requests_employer_amount_idx
  on public.inscription_requests (employer_amount_ht)
  where employer_amount_ht is not null and employer_amount_ht > 0;

-- Pas de modification des policies RLS : la nouvelle colonne herite
-- des policies existantes sur inscription_requests (migration 0025).

-- FIN Migration 0113.
