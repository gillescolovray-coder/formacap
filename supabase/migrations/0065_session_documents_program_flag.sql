-- =========================================================================
-- 0065 — Drapeau "programme de formation officiel" sur session_documents
--
-- Décision Gilles 2026-05-14. Pour joindre automatiquement le programme
-- de la session aux conventions envoyées par email, on a besoin d'identifier
-- UN seul document parmi tous ceux uploadés sur la session comme étant le
-- programme officiel.
--
-- Contrainte : au plus UN document par session peut être marqué comme
-- programme (unique index partiel sur is_training_program = true).
-- =========================================================================

alter table public.session_documents
  add column if not exists is_training_program boolean not null default false;

comment on column public.session_documents.is_training_program is
  'Si true, ce document est le programme de formation officiel de la session, joint automatiquement aux conventions. Au plus 1 par session (cf. index unique partiel). Migration 0065.';

-- Au plus 1 programme officiel par session
drop index if exists session_documents_program_unique;
create unique index session_documents_program_unique
  on public.session_documents (session_id)
  where is_training_program = true;
