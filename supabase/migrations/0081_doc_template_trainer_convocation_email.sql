-- =========================================================
-- Migration 0081 : ajouter le type 'trainer_convocation_email'
--                  aux modèles de documents.
-- =========================================================
-- Personnalisation du sujet + contenu de l'email envoyé AU FORMATEUR
-- (animateur) lorsqu'une session passe en statut "confirmed" depuis
-- l'admin (Paramètres → Modèles documents → onglet "Email convocation
-- formateur").
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
      'convocation_email',
      'trainer_convocation_email'
    )
  );

comment on column public.document_templates.type is
  'Type de document : convocation, emargement, convention, attestation, convention_email, convocation_email, trainer_convocation_email.';
