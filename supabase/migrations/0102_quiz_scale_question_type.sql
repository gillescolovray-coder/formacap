-- =========================================================
-- Migration 0102 : Type de question "scale_0_10"
-- =========================================================
-- Ajoute un nouveau type de question Quiz : échelle 0 à 10
-- (auto-évaluation, sans bonne réponse — le score = la valeur
-- saisie par l'apprenant, max = 10).
--
-- Cas d'usage : mesurer la confiance / le niveau perçu / la
-- satisfaction d'un apprenant, et tracer la progression entre
-- la passation pré-formation et la passation post-formation.
--
-- Stockage :
--   - options       : [{id:'min',label:'<libellé 0>'},
--                      {id:'max',label:'<libellé 10>'}]
--   - correct_answer: null (pas de bonne réponse)
--   - points        : 10 (max possible)
--
-- Gilles 2026-05-23.
-- =========================================================

alter table public.quiz_questions
  drop constraint if exists quiz_questions_type_check;

alter table public.quiz_questions
  add constraint quiz_questions_type_check
  check (type in (
    'qcm_single',
    'qcm_multiple',
    'true_false',
    'text_exact',
    'match_pairs',
    'reorder',
    'scale_0_10'
  ));
