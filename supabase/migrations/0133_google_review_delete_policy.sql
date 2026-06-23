-- Avis Google — fix (Gilles 2026-06-23)
-- La réinitialisation (« Renvoyer ») ne supprimait rien : il manquait la
-- policy RLS DELETE sur google_review_requests. On l'ajoute.

drop policy if exists "google_review_requests_delete_org"
  on public.google_review_requests;
create policy "google_review_requests_delete_org"
  on public.google_review_requests for delete
  using (public.is_org_member(organization_id));
