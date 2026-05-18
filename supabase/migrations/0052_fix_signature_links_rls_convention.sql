-- =========================================================
-- Migration 0052 : Correctif RLS sur signature_links pour les conventions
-- =========================================================
-- La migration 0051 a etendu signature_links pour supporter les
-- conventions (colonne convention_id) mais a oublie d'ajouter une
-- politique INSERT pour ce cas. Resultat : impossible de creer un
-- lien de signature de convention -> erreur "new row violates
-- row-level security policy for table signature_links".
--
-- Cette migration ajoute la politique manquante.
-- =========================================================

drop policy if exists "signature_links_insert_convention_authorized"
  on public.signature_links;

create policy "signature_links_insert_convention_authorized"
  on public.signature_links for insert
  with check (
    convention_id is not null
    and exists (
      select 1
      from public.session_conventions c
      join public.sessions s on s.id = c.session_id
      where c.id = convention_id and (
        public.has_org_role(s.organization_id, 'admin'::public.app_role) or
        public.has_org_role(s.organization_id, 'manager'::public.app_role) or
        public.has_org_role(s.organization_id, 'pedagogy_lead'::public.app_role)
      )
    )
  );

-- =========================================================
-- Pendant qu'on y est : email_log peut aussi avoir un INSERT
-- avec organization_id NULL (cas erreur Resend non configure).
-- On verifie sa politique INSERT.
-- =========================================================
-- La politique existante "email_log_insert_authorized" requiert
-- has_org_role(organization_id, ...) ; si organization_id is null,
-- l'INSERT echoue. On ajoute une politique permissive si l'utilisateur
-- est authentifie (cas log de debug / cas d'erreur de configuration).
drop policy if exists "email_log_insert_self_when_no_org"
  on public.email_log;

create policy "email_log_insert_self_when_no_org"
  on public.email_log for insert
  with check (
    organization_id is null and auth.uid() is not null
  );
