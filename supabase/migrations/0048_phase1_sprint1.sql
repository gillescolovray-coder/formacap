-- =========================================================
-- Migration 0048 : Sprint 1 Phase 1 — Fiche + Participants
-- =========================================================
-- Ajoute les champs Qualiopi manquants sur la fiche session
-- (responsable pédagogique, accessibilité, financement) et un
-- niveau initial sur chaque inscription d'apprenant.

-- ---------------------------------------------------------
-- Fiche session : 3 nouveaux champs
-- ---------------------------------------------------------

alter table public.sessions
  add column if not exists pedagogy_lead       text,
  add column if not exists accessibility_notes text,
  add column if not exists financing_mode      text;

comment on column public.sessions.pedagogy_lead is
  'Responsable pedagogique de la session (texte libre, ex: nom + role).';
comment on column public.sessions.accessibility_notes is
  'Adaptations prevues pour rendre la session accessible (PMR, support visuel, etc.). Texte libre Qualiopi.';
comment on column public.sessions.financing_mode is
  'Mode de financement principal de la session (entreprise, opco, cpf, particulier, autre, mixte). Indicatif - chaque inscription peut avoir son propre mode.';

-- ---------------------------------------------------------
-- Inscription : niveau initial de l'apprenant
-- ---------------------------------------------------------

alter table public.session_enrollments
  add column if not exists initial_level text;

comment on column public.session_enrollments.initial_level is
  'Niveau initial declare/evalue de l''apprenant pour cette session : debutant, intermediaire, confirme, expert.';
