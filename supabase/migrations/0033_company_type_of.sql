-- =========================================================================
-- 0033 — Séparer le type d'entreprise « prescripteur » en deux catégories :
--        - prescripteur : apporteur d'affaires non-formateur
--        - of           : organisme de formation (sous-traitance entrante)
--
-- Auparavant le type `prescripteur` couvrait les deux usages, ce qui
-- empêchait le filtrage propre dans le picker « Source de l'inscription ».
--
-- L'enum `company_type` est étendu avec la valeur `of`. Aucune migration
-- automatique des données existantes : l'utilisateur reclassifie
-- manuellement les fiches OF (le libellé du type `prescripteur` est
-- mis à jour côté UI : « Prescripteur » au lieu de « OF / Prescripteur »).
-- =========================================================================

alter type company_type add value if not exists 'of';
