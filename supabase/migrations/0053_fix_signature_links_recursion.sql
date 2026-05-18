-- =========================================================
-- Migration 0053 : Briser la recursion infinie entre les politiques
--                  RLS de signature_links et session_conventions
-- =========================================================
-- Symptome : "infinite recursion detected in policy for relation
--             signature_links" lors d'un INSERT signature_links pour
--             une convention.
--
-- Cause : la politique INSERT de signature_links fait un EXISTS sur
-- session_conventions ; or session_conventions a une politique SELECT
-- "session_conventions_select_via_signature_link" qui fait elle-meme
-- un EXISTS sur signature_links. PostgreSQL detecte la boucle et abandonne.
--
-- Solution : remplacer ces sub-queries par des fonctions
-- SECURITY DEFINER qui contournent la RLS (comme `is_org_member` et
-- `has_org_role` deja en place dans 0001).
-- =========================================================

-- ---------------------------------------------------------
-- Fonction : un signature_link valide existe-t-il pour cette convention ?
-- ---------------------------------------------------------
create or replace function public.has_valid_signature_link_for_convention(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.signature_links sl
    where sl.convention_id = c_id
      and sl.expires_at > now()
  );
$$;

create or replace function public.has_unused_signature_link_for_convention(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.signature_links sl
    where sl.convention_id = c_id
      and sl.expires_at > now()
      and sl.used_at is null
  );
$$;

-- ---------------------------------------------------------
-- Idem pour les emargements (utilise par attendance_signatures)
-- ---------------------------------------------------------
create or replace function public.has_valid_signature_link_for_enrollment(e_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.signature_links sl
    where sl.enrollment_id = e_id
      and sl.expires_at > now()
      and sl.used_at is null
  );
$$;

-- ---------------------------------------------------------
-- Reecrire les politiques recursives en utilisant ces fonctions
-- ---------------------------------------------------------

-- session_conventions : SELECT via lien de signature
drop policy if exists "session_conventions_select_via_signature_link"
  on public.session_conventions;
create policy "session_conventions_select_via_signature_link"
  on public.session_conventions for select
  using (public.has_valid_signature_link_for_convention(id));

-- session_conventions : UPDATE (marquer signee) via lien
drop policy if exists "session_conventions_update_sign_via_link"
  on public.session_conventions;
create policy "session_conventions_update_sign_via_link"
  on public.session_conventions for update
  using (public.has_unused_signature_link_for_convention(id));

-- attendance_signatures : INSERT public via lien d'emargement
drop policy if exists "attendance_signatures_insert_via_signature_link"
  on public.attendance_signatures;
create policy "attendance_signatures_insert_via_signature_link"
  on public.attendance_signatures for insert
  with check (
    signer_role = 'learner'
    and public.has_valid_signature_link_for_enrollment(enrollment_id)
  );

-- ---------------------------------------------------------
-- Verification : pas d'oubli sur les autres tables qui pourraient
-- boucler. La politique INSERT signature_links (cas enrollment ET
-- convention) reste OK car elle interroge respectivement
-- session_enrollments et session_conventions, ces deux tables ne
-- referencent pas signature_links dans LEURS politiques d'INSERT.
-- Le risque de recursion etait uniquement sur le SELECT/UPDATE de
-- session_conventions.
-- ---------------------------------------------------------
