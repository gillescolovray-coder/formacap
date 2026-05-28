-- =========================================================
-- Migration 0108 : cle d'idempotence sur session_documents
-- =========================================================
-- Bug Gilles 2026-05-28 : double upload (fichier en doublon dans la
-- liste) quand le formateur clique 2 fois sur "Televerser" pendant
-- les 1-3 secondes d'upload.
--
-- Solution professionnelle (pattern Stripe / AWS) : cle d'idempotence
-- generee cote client a chaque ouverture du formulaire. Toute
-- soumission ulterieure avec la meme cle est ignoree silencieusement
-- par le serveur (unique constraint).
--
-- Resiste a : double-clic, retry reseau, refresh navigateur,
-- requetes simultanees, etc.
-- =========================================================

alter table public.session_documents
  add column if not exists client_request_id uuid;

-- Unique partial index : on autorise NULL (lignes anciennes ou
-- uploads depuis l'admin qui n'utilisent pas encore la cle), mais
-- une fois une cle posee, elle est unique.
create unique index if not exists uniq_session_documents_client_request_id
  on public.session_documents(client_request_id)
  where client_request_id is not null;

comment on column public.session_documents.client_request_id is
  'Cle d''idempotence generee par le client a chaque ouverture du formulaire d''upload. Empeche les doublons en cas de double-clic ou retry. Migration 0108.';
