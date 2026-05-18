-- =========================================================
-- Migration 0054 : Etendre document_templates aux conventions
--                  et attestations (en-tete/pied modifiables)
-- =========================================================
-- La migration 0050 avait limite le type aux valeurs 'convocation'
-- et 'emargement'. On etend a 'convention' et 'attestation' pour
-- permettre la personnalisation des en-tetes et pieds de page des
-- documents commerciaux/legaux.
-- =========================================================

-- Supprime l'ancien check
alter table public.document_templates
  drop constraint if exists document_templates_type_check;

-- Ajoute le nouveau check etendu
alter table public.document_templates
  add constraint document_templates_type_check
  check (type in ('convocation', 'emargement', 'convention', 'attestation'));

comment on column public.document_templates.type is
  'Type de document : convocation, emargement, convention ou attestation. Chaque type a son propre schema de blocs (cf. lib/document-templates/types.ts).';
