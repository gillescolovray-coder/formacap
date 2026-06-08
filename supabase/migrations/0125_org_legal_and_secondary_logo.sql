-- =========================================================
-- Migration 0125 : Champs légaux structurés + logo secondaire
-- =========================================================
-- Alimentent le pied de page et l'en-tête du « Programme de formation »
-- diffusable (charte CAP). Les autres champs (adresse, tél, email, site,
-- SIRET, NDA, représentant légal) existent déjà sur organizations.
-- =========================================================

alter table public.organizations
  add column if not exists legal_form        text,  -- ex. SARL, SAS…
  add column if not exists share_capital     text,  -- ex. "2 000 €"
  add column if not exists rcs_number        text,  -- ex. "522 316 884 00025"
  add column if not exists vat_number        text,  -- ex. "FR54 522 316 884"
  add column if not exists nda_authority     text,  -- ex. "DREETS Provence-Alpes-Côte d'Azur"
  add column if not exists secondary_logo_url text; -- logo secondaire (Conseils & Formations)

comment on column public.organizations.legal_form is 'Forme juridique (SARL, SAS…). Migration 0125.';
comment on column public.organizations.secondary_logo_url is 'Logo secondaire affiché à côté du logo principal sur le programme diffusable. Migration 0125.';
