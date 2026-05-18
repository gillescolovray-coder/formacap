-- =========================================================================
-- 0037 — Hiérarchie société mère / filiale
--
-- Permet de rattacher une entreprise à une « société mère » via une
-- auto-référence sur companies.id. Une entreprise sans parent est
-- considérée comme une « société mère » (top of the chain).
--
-- Règles métier :
--   - Une entreprise ne peut avoir qu'UN seul parent (relation N-1).
--   - Une entreprise peut avoir plusieurs filiales (relation 1-N
--     consultée en filtrant les autres lignes par parent_company_id = id).
--   - L'auto-référence (parent_company_id = id) est interdite.
--   - À la suppression du parent : on conserve les filiales (SET NULL).
-- =========================================================================

alter table public.companies
  add column if not exists parent_company_id uuid
    references public.companies(id) on delete set null;

-- Auto-référence interdite : une société ne peut pas être sa propre mère.
alter table public.companies
  drop constraint if exists company_no_self_parent;
alter table public.companies
  add constraint company_no_self_parent
  check (parent_company_id is null or parent_company_id <> id);

create index if not exists idx_companies_parent
  on public.companies(parent_company_id);

comment on column public.companies.parent_company_id is
  'Société mère qui contrôle cette entreprise. NULL si l''entreprise est une société mère elle-même (ou autonome).';
