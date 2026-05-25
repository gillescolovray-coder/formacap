-- =========================================================
-- Migration 0106 : Form-builder pour positioning_templates
-- =========================================================
-- Avant : les templates n'avaient que 2 listes de choix
-- (expectation_choices + mastery_criteria) insérées dans une
-- structure de test FIGÉE (6 sections fixes).
--
-- Après : on ajoute une colonne `structure` jsonb qui contient
-- un formulaire COMPLET (sections + questions de tous types).
-- Quand structure est non-null, le formulaire apprenant rend
-- dynamiquement la structure (au lieu de la structure legacy).
--
-- Rétrocompat : les anciens templates (structure NULL) continuent
-- de fonctionner comme avant (PositioningForm classique).
--
-- Sections fixes conservées (gérées par l'app, pas dans la
-- structure) : 'Informations participant' (auto-rempli) en haut,
-- 'Validation participant' (signature + date) en bas.
--
-- Gilles 2026-05-25, Phase 3 — Form Builder.
-- =========================================================

alter table public.positioning_templates
  add column if not exists structure jsonb;

comment on column public.positioning_templates.structure is
  'Structure JSON du formulaire personnalisé (form-builder). Si NULL, on retombe sur le mode legacy à partir de expectation_choices + mastery_criteria. Migration 0106.';

-- Format attendu de structure :
-- {
--   "intro": {
--     "instructions": "Texte d''introduction…",
--     "important_note": "IMPORTANT : si vous avez déjà…"
--   },
--   "sections": [
--     {
--       "title": "Votre expérience",
--       "questions": [
--         { "type": "radio", "text": "…", "required": true,
--           "options": ["Oui régulièrement", "Oui occasionnellement", "Non jamais"] },
--         { "type": "matrix", "text": "Documents exploités",
--           "rows": ["RC", "CCAP", "CCTP", "DPGF"],
--           "cols": ["Oui régulièrement", "Oui occasionnellement", "Non"] },
--         { "type": "checkbox", "text": "…", "options": [...], "allow_other": true },
--         { "type": "yes_no_text", "text": "…", "followup_label": "Si oui, précisez :" },
--         { "type": "text_long", "text": "…", "rows": 4 }
--       ]
--     }
--   ]
-- }
