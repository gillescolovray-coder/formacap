-- =========================================================
-- Migration 0083 : Policy UPDATE manquante sur session_documents
-- =========================================================
-- La migration 0047 a créé les policies SELECT / INSERT / DELETE
-- sur session_documents mais pas UPDATE. Conséquence : RLS bloque
-- silencieusement toute modification (changement de visibilité,
-- renommage…) — l'UPDATE retourne 0 ligne affectée sans erreur,
-- l'application semble fonctionner mais rien n'est persisté.
--
-- Ajoute la policy UPDATE avec les mêmes rôles autorisés que
-- INSERT (admin / manager / pedagogy_lead / trainer).
-- =========================================================

drop policy if exists "session_documents_update_authorized"
  on public.session_documents;
create policy "session_documents_update_authorized"
  on public.session_documents for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role) or
    public.has_org_role(organization_id, 'trainer'::public.app_role)
  )
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role) or
    public.has_org_role(organization_id, 'trainer'::public.app_role)
  );
