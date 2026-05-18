-- =====================================================================
-- 0091_company_logo.sql
-- Logo personnalisé sur les entreprises partenaires
-- =====================================================================
--
-- Ajoute un champ `logo_url` aux entreprises pour que les partenaires
-- (OF / prescripteurs) puissent afficher leur propre logo sur la page
-- publique de pré-inscription `/preinscription/[token]`.
--
-- Stockage : URL libre (le partenaire colle un lien vers son logo
-- déjà hébergé — Drive public, son site, etc.). Pas d'upload via
-- l'app pour démarrer.

alter table public.companies
  add column if not exists logo_url text;

comment on column public.companies.logo_url is
  'URL publique du logo de l''entreprise (utilisé sur les pages partenaire — pré-inscription notamment).';
