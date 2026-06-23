-- Avis Google — Étape 1 (Gilles 2026-06-23)
-- Demande d'avis Google envoyée aux apprenants « Très satisfait » à l'éval
-- à chaud. Envoi MANUEL dans un premier temps + suivi precis (qui a recu,
-- quand, par qui, mode auto/manuel). Anti-doublon : 1 par participation
-- (= 1 par enrollment, donc 1 par (apprenant, session)).

-- 1. Lien d'avis Google de l'organisation (configurable en Paramètres).
alter table public.organizations
  add column if not exists google_review_url text;

-- Pré-remplissage du lien CAP NUMERIQUE (single-tenant FORMACAP) — modifiable
-- ensuite dans Paramètres > Organisation.
update public.organizations
set google_review_url =
  'https://www.google.com/maps/place//data=!4m3!3m2!1s0x47f4da28d2725d57:0xf887da3dda38624b!12e1?source=g.page.m.kd._&laa=lu-desktop-review-solicitation'
where google_review_url is null;

-- 2. Table de suivi des demandes d'avis Google.
create table if not exists public.google_review_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  enrollment_id    uuid not null references public.session_enrollments(id) on delete cascade,
  session_id       uuid references public.sessions(id) on delete set null,
  learner_id       uuid references public.learners(id) on delete set null,
  email            text not null,
  -- Mode d'envoi : manuel (sélection) ou auto (batch hebdo / clôture, étape 2).
  channel          text not null default 'manual' check (channel in ('manual', 'auto')),
  -- Qui a déclenché l'envoi manuel (null pour les envois automatiques).
  sent_by          uuid references auth.users(id) on delete set null,
  status           text not null default 'sent'
                     check (status in ('sent', 'delivered', 'opened', 'clicked', 'failed')),
  resend_message_id text,
  sent_at          timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- Anti-doublon : une seule demande par participation (enrollment).
create unique index if not exists uq_google_review_requests_enrollment
  on public.google_review_requests(enrollment_id);

create index if not exists idx_google_review_requests_session
  on public.google_review_requests(session_id);
create index if not exists idx_google_review_requests_org
  on public.google_review_requests(organization_id);

-- 3. RLS : accès réservé aux membres de l'organisation.
alter table public.google_review_requests enable row level security;

drop policy if exists "google_review_requests_select_org"
  on public.google_review_requests;
create policy "google_review_requests_select_org"
  on public.google_review_requests for select
  using (public.is_org_member(organization_id));

drop policy if exists "google_review_requests_insert_org"
  on public.google_review_requests;
create policy "google_review_requests_insert_org"
  on public.google_review_requests for insert
  with check (public.is_org_member(organization_id));

drop policy if exists "google_review_requests_update_org"
  on public.google_review_requests;
create policy "google_review_requests_update_org"
  on public.google_review_requests for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
