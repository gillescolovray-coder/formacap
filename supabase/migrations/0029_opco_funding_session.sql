-- =========================================================
-- Migration 0029 : rattachement de l'accord OPCO à une session
-- =========================================================
-- Un accord OPCO concerne une action de formation = une session
-- précise. On stocke `session_id` au niveau de l'accord pour pouvoir
-- proposer ensuite l'affectation aux apprenants inscrits sur CETTE
-- session uniquement.
-- =========================================================

alter table public.opco_funding_agreements
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

create index if not exists idx_opco_funding_agreements_session
  on public.opco_funding_agreements(session_id);

comment on column public.opco_funding_agreements.session_id is
  'Session de formation concernée par l''accord. Permet de filtrer les apprenants candidats à l''affectation (mêmes inscrits sur cette session).';
