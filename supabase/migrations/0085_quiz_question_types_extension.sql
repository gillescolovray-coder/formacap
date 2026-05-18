-- =========================================================
-- Migration 0085 : Nouveaux types de question Quiz
-- =========================================================
-- Ajoute 2 types de questions inspirés de La Quizinière :
--   - match_pairs : association de paires gauche/droite
--   - reorder    : remise en ordre d'éléments
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
    'reorder'
  ));
