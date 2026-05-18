-- =========================================================
-- Migration 0074 : ajouter le type 'convocation_email' aux
--                  modèles de documents (texte personnalisable
--                  de l'email d'envoi de convocation).
-- =========================================================
-- Permet à l'admin de personnaliser le sujet et le contenu de
-- l'email envoyé à l'apprenant avec la convocation en pièce
-- jointe (Paramètres → Modèles documents → onglet "Email
-- convocation").
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
      'convention_email',
      'convocation_email'
    )
  );

comment on column public.document_templates.type is
  'Type de document : convocation, emargement, convention, attestation, convention_email, convocation_email.';
