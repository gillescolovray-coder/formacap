-- =========================================================
-- Migration 0040 : Bloc visioconférence enrichi sur sessions
-- =========================================================
-- Ajoute deux colonnes pour décrire la visio d'une session :
--   - video_app          : application utilisée (Zoom, Teams, Meet…)
--   - video_instructions : consignes/recommandations reprises
--                          dans la convocation apprenant (Qualiopi).
-- video_link existe déjà depuis 0006_sessions.

alter table public.sessions
  add column if not exists video_app          text,
  add column if not exists video_instructions text;

comment on column public.sessions.video_app is
  'Application de visioconference utilisee (Zoom, Teams, Google Meet, Webex, Autre…). Texte libre cote BDD.';
comment on column public.sessions.video_instructions is
  'Consignes de connexion reprises dans la convocation apprenant (exigence Qualiopi).';
