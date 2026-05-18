-- Distance teaching methods (Moyens pédagogiques et techniques FOAD).
--
-- Pendant logique de distance_modalities (0068) : lorsque la formation
-- est dispensée à distance, la convention de formation doit préciser les
-- moyens pédagogiques et techniques mis en œuvre dans ce contexte
-- spécifique (méthodes, outils, support, prérequis matériel côté
-- stagiaire). Distinct de teaching_methods (qui décrit les méthodes
-- générales du programme) pour permettre une mention dédiée Qualiopi.
--
-- Texte par défaut injecté côté UI quand l'utilisateur passe la modalité
-- en distanciel/hybride (cf. _modality-section.tsx pour le wording).

alter table public.formations
  add column if not exists distance_teaching_methods text;

alter table public.sessions
  add column if not exists distance_teaching_methods text;

comment on column public.formations.distance_teaching_methods is
  'Moyens pédagogiques et techniques mis en œuvre en distanciel (FOAD). Affiché dans la convention quand la session est en distanciel. Saisi sur la fiche catalogue puis recopié sur chaque session créée (éditable par session).';

comment on column public.sessions.distance_teaching_methods is
  'Moyens pédagogiques et techniques mis en œuvre en distanciel (FOAD) propres à cette session. Initialisé depuis formations.distance_teaching_methods à la création, éditable ensuite. Affiché dans la convention quand modality = distanciel.';
