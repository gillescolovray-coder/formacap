-- ============================================================
-- Lien entre inscription et OPCO du référentiel
-- Gilles 2026-05-21 (Phase 2 référentiel OPCO)
--
-- Ajoute une colonne `opco_id` à `inscription_requests` pour
-- enregistrer l'OPCO choisi quand le mode de financement est "opco".
-- L'OPCO est sélectionné dans une liste déroulante peuplée par la
-- table `opcos` (référentiel — migration 0094).
--
-- ON DELETE SET NULL : si on supprime un OPCO du référentiel, on ne
-- veut pas perdre l'inscription — on garde juste le mode "opco" sans
-- référence précise.
-- ============================================================

alter table public.inscription_requests
  add column if not exists opco_id uuid
  references public.opcos(id) on delete set null;

create index if not exists idx_inscription_requests_opco_id
  on public.inscription_requests(opco_id);
