-- =========================================================
-- Migration 0055 : Stockage du prix de la convention (CA)
-- =========================================================
-- Pour permettre le suivi du chiffre d'affaires par session × societe,
-- on stocke sur chaque convention :
--   - amount_ht_unit  : prix unitaire par apprenant (repris de la session)
--   - amount_ht_total : total = unit × nb apprenants de la societe
--
-- Calcule au moment de la creation/envoi de la convention, fige le CA
-- meme si le prix de la session change plus tard.
-- =========================================================

alter table public.session_conventions
  add column if not exists amount_ht_unit  numeric(10, 2),
  add column if not exists amount_ht_total numeric(10, 2),
  add column if not exists vat_rate        numeric(4, 2) default 20.00;

comment on column public.session_conventions.amount_ht_unit is
  'Prix HT par apprenant figé au moment de la creation de la convention.';
comment on column public.session_conventions.amount_ht_total is
  'Total HT de la convention = amount_ht_unit × nombre d''apprenants de la societe pour cette session. Sert au suivi du CA.';
comment on column public.session_conventions.vat_rate is
  'Taux de TVA applique (20%% par defaut).';
