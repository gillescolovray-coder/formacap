-- =========================================================
-- Migration 0073 : ajouter le type 'convention_email' aux
--                  modèles de documents (texte personnalisable
--                  de l'email d'envoi de convention).
-- =========================================================
-- Permet à l'admin de personnaliser le sujet et le contenu de
-- l'email envoyé au contact RH avec la convention en pièce
-- jointe (Paramètres → Modèles documents → onglet "Email
-- convention").
-- =========================================================

alter table public.document_templates
  drop constraint if exists document_templates_type_check;

alter table public.document_templates
  add constraint document_templates_type_check
  check (
    type in (
      'convocation',
      'emargement',
      'convention',
      'attestation',
      'convention_email'
    )
  );

comment on column public.document_templates.type is
  'Type de document : convocation, emargement, convention, attestation, convention_email. Chaque type a son propre schéma de blocs (cf. lib/document-templates/types.ts).';
