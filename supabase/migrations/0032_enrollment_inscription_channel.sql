-- =========================================================
-- Migration 0032 : canal d'inscription par apprenant
-- =========================================================
-- Objectif : qualifier la SOURCE / le CANAL d'inscription pour
-- chaque apprenant inscrit sur une session. Trois cas :
--   - direct       : apprenant inscrit directement via CAP NUMERIQUE
--   - prescripteur : inscription via un OF / prescripteur (acquisition)
--   - of           : inscription via un autre OF (sous-traitance)
-- Si "prescripteur" ou "of", on stocke l'ID de l'entreprise
-- correspondante pour pouvoir reporter / tracer.
-- =========================================================

-- Enum inscription_channel (idempotent)
do $$ begin
  if not exists (select 1 from pg_type where typname = 'inscription_channel') then
    create type public.inscription_channel as enum (
      'direct',
      'prescripteur',
      'of'
    );
  end if;
end $$;

alter table public.session_enrollments
  add column if not exists inscription_channel public.inscription_channel
    not null default 'direct',
  add column if not exists inscription_channel_company_id uuid
    references public.companies(id) on delete set null;

create index if not exists idx_session_enrollments_channel
  on public.session_enrollments(inscription_channel);

comment on column public.session_enrollments.inscription_channel is
  'Canal d''inscription : direct (CAP NUMERIQUE), via un prescripteur, ou via un autre OF.';
comment on column public.session_enrollments.inscription_channel_company_id is
  'Entreprise référencée si le canal est prescripteur ou of (FK companies).';

-- On applique le même mécanisme aux inscription_requests (workflow amont)
alter table public.inscription_requests
  add column if not exists inscription_channel public.inscription_channel
    not null default 'direct',
  add column if not exists inscription_channel_company_id uuid
    references public.companies(id) on delete set null;

create index if not exists idx_inscription_requests_channel
  on public.inscription_requests(inscription_channel);
