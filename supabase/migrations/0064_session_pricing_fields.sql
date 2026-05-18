-- =========================================================================
-- 0064 — Champs de tarification au niveau session
--
-- Décision Gilles 2026-05-14, règle métier R7. Chaque session porte ses
-- propres tarifs, pré-remplis depuis les paramètres organisation à la
-- création, modifiables ensuite par l'utilisateur.
--
-- Mode de tarification :
--   • per_learner (INTER) : prix × nbApprenants × nbJours
--   • forfait    (INTRA)  : forfait × nbJours
--                          + extraPerDay × max(0, nbApprenants − seuil) × nbJours
--
-- Le champ existant `sessions.amount_ht` reste pour rétrocompatibilité
-- (montant total saisi manuellement) — on le laissera vide à terme,
-- une fois la cascade en place.
-- =========================================================================

alter table public.sessions
  add column if not exists pricing_mode text
    check (pricing_mode in ('per_learner', 'forfait')),
  add column if not exists price_per_day_ht         numeric(10,2),
  add column if not exists price_forfait_ht         numeric(10,2),
  add column if not exists price_extra_per_day_ht   numeric(10,2),
  add column if not exists pricing_threshold        integer default 4
    check (pricing_threshold is null or pricing_threshold >= 1);

comment on column public.sessions.pricing_mode is
  'Mode de tarification de la session : "per_learner" (INTER) ou "forfait" (INTRA). R7 — Migration 0064.';
comment on column public.sessions.price_per_day_ht is
  'Prix HT par jour par apprenant (mode per_learner). R7 — Migration 0064.';
comment on column public.sessions.price_forfait_ht is
  'Forfait HT par jour (mode forfait, INTRA, applicable jusqu''au seuil). R7 — Migration 0064.';
comment on column public.sessions.price_extra_per_day_ht is
  'Prix HT par apprenant supplémentaire au-delà du seuil (mode forfait). R7 — Migration 0064.';
comment on column public.sessions.pricing_threshold is
  'Seuil d''apprenants à partir duquel on facture l''extra (mode forfait). Défaut 4. R7 — Migration 0064.';

-- Backfill : pré-remplir les tarifs des sessions existantes depuis les
-- paramètres org de l'organisation, selon (is_inter, modality).
-- On laisse vide (NULL) pour les sessions sans modality renseignée —
-- l'utilisateur les complètera à la prochaine ouverture.
update public.sessions s
set
  pricing_mode = case when s.is_inter then 'per_learner' else 'forfait' end,
  price_per_day_ht = case
    when s.is_inter and s.modality = 'presentiel'
      then d.inter_presentiel_per_day_ht
    when s.is_inter and s.modality = 'distanciel'
      then d.inter_distanciel_per_day_ht
    else null
  end,
  price_forfait_ht = case
    when not s.is_inter and s.modality = 'presentiel'
      then d.intra_presentiel_forfait_ht
    when not s.is_inter and s.modality = 'distanciel'
      then d.intra_distanciel_forfait_ht
    else null
  end,
  price_extra_per_day_ht = case
    when not s.is_inter and s.modality = 'presentiel'
      then d.intra_presentiel_extra_per_day_ht
    when not s.is_inter and s.modality = 'distanciel'
      then d.intra_distanciel_extra_per_day_ht
    else null
  end,
  pricing_threshold = case
    when not s.is_inter then d.intra_forfait_threshold
    else null
  end
from public.organization_pricing_defaults d
where d.organization_id = s.organization_id
  and s.pricing_mode is null;
