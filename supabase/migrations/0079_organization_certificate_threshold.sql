-- =========================================================
-- Migration 0079 : Seuil de présence pour certificat réalisation
-- =========================================================
-- Ajoute un paramètre organisation : pourcentage minimum de
-- présence (demi-journées signées) pour qu'un apprenant puisse
-- télécharger son certificat de réalisation depuis son portail.
--
-- Défaut = 80 %. Si l'apprenant a signé moins de 80 % des
-- demi-journées, la carte "Certificat" reste grisée sur son
-- portail avec une explication.
-- =========================================================

alter table public.organizations
  add column if not exists realization_certificate_threshold_percent integer
    not null default 80
    check (realization_certificate_threshold_percent between 0 and 100);

comment on column public.organizations.realization_certificate_threshold_percent is
  'Pourcentage minimum de présence pour qu''un apprenant puisse télécharger son certificat de réalisation. Défaut 80%. Range 0-100. Migration 0079.';
