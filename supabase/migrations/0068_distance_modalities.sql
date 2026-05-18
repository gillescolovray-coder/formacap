-- Distance modalities (FOAD) field on formations and sessions.
--
-- Lorsque la modalité d'une formation/session est "distanciel" (ou hybride),
-- on doit indiquer dans la convention de formation les modalités pratiques
-- du déroulement à distance (outil de visio, prérequis matériel, contrôle
-- d'assiduité). Texte libre, modifiable au niveau de la fiche catalogue
-- (formation) puis recopié et éventuellement édité au niveau de la session.
--
-- Texte par défaut affiché dans le formulaire formation quand on bascule
-- en distanciel — saisi côté UI, pas en SQL (pour rester contrôlable par
-- les futurs ajustements de wording sans nouvelle migration).

alter table public.formations
  add column if not exists distance_modalities text;

alter table public.sessions
  add column if not exists distance_modalities text;

comment on column public.formations.distance_modalities is
  'Modalités de déroulement à distance (FOAD). Affiché et obligatoire dans la convention quand la session est en distanciel. Saisi sur la fiche catalogue puis recopié sur chaque session créée à partir de ce programme (éditable par session).';

comment on column public.sessions.distance_modalities is
  'Modalités de déroulement à distance (FOAD) propres à cette session. Initialisé depuis formations.distance_modalities à la création, éditable ensuite. Affiché dans la convention quand modality = distanciel.';
