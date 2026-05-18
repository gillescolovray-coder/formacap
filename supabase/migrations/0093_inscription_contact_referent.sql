-- =====================================================================
-- 0093_inscription_contact_referent.sql
-- Contact référent pédagogique de la session pour une inscription
-- =====================================================================
--
-- Pour l'envoi de la convention de formation (Qualiopi indic. 9) et les
-- échanges administratifs RH, il faut un contact côté entreprise
-- DISTINCT de l'apprenant — typiquement le RH / responsable formation.
--
-- 5 colonnes texte optionnelles sur inscription_requests :
--   - contact_referent_first_name / last_name
--   - contact_referent_email     (recevra la convention)
--   - contact_referent_phone
--   - contact_referent_role      (fonction)

alter table public.inscription_requests
  add column if not exists contact_referent_first_name text,
  add column if not exists contact_referent_last_name  text,
  add column if not exists contact_referent_email      text,
  add column if not exists contact_referent_phone      text,
  add column if not exists contact_referent_role       text;

comment on column public.inscription_requests.contact_referent_email is
  'Email du référent côté entreprise qui recevra la convention de formation et les documents Qualiopi (distinct de l''apprenant).';
