-- =========================================================
-- Migration 0050 : Sprint 2 — Templates documents, journal email,
--                  signatures à distance
-- =========================================================
-- 3 nouvelles tables pour le Sprint 2 :
--
--  1. document_templates : 1 modèle personnalisable par type (convocation,
--     émargement) et par organisation. Stocke charte + blocs JSONB.
--
--  2. email_log : journal d'envoi des emails (audit Qualiopi). Trace
--     destinataire, sujet, statut, ID fournisseur (Resend), erreur.
--
--  3. signature_links : tokens à usage unique pour signature à distance.
--     Un apprenant clique sur le lien reçu par email et signe sa feuille
--     d'émargement sans avoir besoin de se connecter.
-- =========================================================

-- =========================================================
-- 1) document_templates
-- =========================================================
create table public.document_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type            text not null check (type in ('convocation', 'emargement')),

  -- Charte (par défaut alignée sur la palette CAP NUMÉRIQUE)
  color_primary   text not null default '#1e40af',
  color_secondary text not null default '#06b6d4',

  -- Blocs éditoriaux (rich text + paramètres)
  blocks          jsonb not null default '{}'::jsonb,

  -- Méta
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (organization_id, type)
);

create index idx_document_templates_org on public.document_templates(organization_id);

comment on table public.document_templates is
  'Modeles personnalisables des documents Qualiopi (convocation, emargement) par organisation.';
comment on column public.document_templates.blocks is
  'Blocs editoriaux (JSON) : titre, paragraphes, mentions, signature, etc.';

create trigger document_templates_updated_at
  before update on public.document_templates
  for each row execute function public.set_updated_at();

alter table public.document_templates enable row level security;

create policy "document_templates_select_org_members"
  on public.document_templates for select
  using (public.is_org_member(organization_id));

create policy "document_templates_insert_authorized"
  on public.document_templates for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role)
  );

create policy "document_templates_update_authorized"
  on public.document_templates for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role)
  );

create policy "document_templates_delete_admin"
  on public.document_templates for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));

-- =========================================================
-- 2) email_log — journal d'envoi des emails
-- =========================================================
create table public.email_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Lien optionnel à une inscription (pour les convocations / liens signature)
  enrollment_id   uuid references public.session_enrollments(id) on delete set null,

  type            text not null,            -- 'convocation' | 'signature_link' | 'autre'
  to_email        text not null,
  to_name         text,
  subject         text,
  status          text not null default 'queued'
                    check (status in ('queued', 'sent', 'failed')),

  -- Identifiant retourné par le fournisseur (Resend)
  provider        text,                     -- 'resend' | 'manual' | autre
  provider_id     text,
  error           text,

  sent_at         timestamptz,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);

create index idx_email_log_org        on public.email_log(organization_id);
create index idx_email_log_enrollment on public.email_log(enrollment_id);
create index idx_email_log_created    on public.email_log(created_at desc);

comment on table public.email_log is
  'Journal des emails envoyes par l''application (audit Qualiopi). Utilise pour les convocations et liens de signature a distance.';

alter table public.email_log enable row level security;

create policy "email_log_select_org_members"
  on public.email_log for select
  using (public.is_org_member(organization_id));

create policy "email_log_insert_authorized"
  on public.email_log for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role) or
    public.has_org_role(organization_id, 'trainer'::public.app_role)
  );

create policy "email_log_update_authorized"
  on public.email_log for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role)
  );

-- =========================================================
-- 3) signature_links — signature à distance via token
-- =========================================================
create table public.signature_links (
  id              uuid primary key default gen_random_uuid(),
  enrollment_id   uuid not null references public.session_enrollments(id) on delete cascade,

  token           text not null unique,

  -- Période ciblée. Si NULL, le lien permet de signer toutes les
  -- demi-journées éligibles d'une session (cas le plus courant).
  period_date     date,
  moment          text check (moment in ('morning', 'afternoon')),

  expires_at      timestamptz not null default (now() + interval '30 days'),
  used_at         timestamptz,
  used_ip         text,
  used_user_agent text,

  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);

create index idx_signature_links_enrollment on public.signature_links(enrollment_id);
create index idx_signature_links_token      on public.signature_links(token);
create index idx_signature_links_active     on public.signature_links(token)
  where used_at is null;

comment on table public.signature_links is
  'Tokens a usage unique permettant a un apprenant de signer sa feuille d''emargement a distance, sans connexion.';

alter table public.signature_links enable row level security;

-- SELECT public : un visiteur anonyme peut lire son token tant qu'il n'est
-- pas expiré (la couche applicative vérifie aussi expires_at + used_at).
create policy "signature_links_select_public_via_token"
  on public.signature_links for select
  using (expires_at > now());

-- SELECT membres : pour gestion côté admin
create policy "signature_links_select_org_members"
  on public.signature_links for select
  using (exists (
    select 1
    from public.session_enrollments e
    join public.sessions s on s.id = e.session_id
    where e.id = enrollment_id and public.is_org_member(s.organization_id)
  ));

create policy "signature_links_insert_authorized"
  on public.signature_links for insert
  with check (exists (
    select 1
    from public.session_enrollments e
    join public.sessions s on s.id = e.session_id
    where e.id = enrollment_id and (
      public.has_org_role(s.organization_id, 'admin'::public.app_role) or
      public.has_org_role(s.organization_id, 'manager'::public.app_role) or
      public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role) or
      public.has_org_role(s.organization_id, 'trainer'::public.app_role)
    )
  ));

-- UPDATE : marquer comme utilisé. Public car appelé côté visiteur anonyme
-- depuis la page /signer/[token]. La couche applicative vérifie qu'on
-- ne marque que des liens valides (token correspond, non expiré).
create policy "signature_links_update_mark_used_public"
  on public.signature_links for update
  using (expires_at > now() and used_at is null);

-- DELETE : admin uniquement
create policy "signature_links_delete_admin"
  on public.signature_links for delete
  using (exists (
    select 1
    from public.session_enrollments e
    join public.sessions s on s.id = e.session_id
    where e.id = enrollment_id and
      public.has_org_role(s.organization_id, 'admin'::public.app_role)
  ));

-- =========================================================
-- 4) attendance_signatures : autoriser INSERT public depuis lien signature
-- =========================================================
-- Pour permettre l'écriture de la signature depuis /signer/[token]
-- sans connexion, on ajoute une politique INSERT publique conditionnée
-- à l'existence d'un signature_link valide pour cette inscription.
create policy "attendance_signatures_insert_via_signature_link"
  on public.attendance_signatures for insert
  with check (
    signer_role = 'learner'
    and exists (
      select 1 from public.signature_links sl
      where sl.enrollment_id = attendance_signatures.enrollment_id
        and sl.expires_at > now()
        and sl.used_at is null
    )
  );

-- =========================================================
-- 5) Compléter session_enrollments si nécessaire
-- =========================================================
-- Le code existant utilise convocation_sent_at — on s'assure qu'il
-- existe avec la bonne sémantique (déjà défini ailleurs sans doute,
-- on garde une garantie ici).
alter table public.session_enrollments
  add column if not exists convocation_sent_at timestamptz;

comment on column public.session_enrollments.convocation_sent_at is
  'Date d''envoi de la convocation (manuel ou via email automatique). Preuve Qualiopi.';
