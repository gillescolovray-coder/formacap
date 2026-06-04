-- =========================================================
-- Migration 0117 : Fusion de fiches entreprises en double
-- =========================================================
-- Contexte : la création automatique de fiches "minimales" depuis un
-- nom d'entreprise en texte libre (saisie express / inscription rapide)
-- a pu générer des DOUBLONS (ex. SMMM x3). On fournit une fonction de
-- fusion qui réassigne TOUTES les références (apprenants, contacts,
-- inscriptions, conventions, notes, hiérarchie, facturation, portail
-- partenaire, etc.) de la fiche SOURCE vers la fiche CIBLE, puis
-- supprime la source.
--
-- La découverte des clés étrangères est DYNAMIQUE (information_schema)
-- pour rester robuste si de nouvelles tables référencent companies à
-- l'avenir.
--
-- Sécurité : SECURITY DEFINER + vérification que l'appelant est
-- admin/manager de l'organisation propriétaire des deux fiches.
-- =========================================================

create or replace function public.merge_companies(
  p_target uuid,
  p_source uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_target_org uuid;
  v_source_org uuid;
begin
  if p_target is null or p_source is null then
    raise exception 'Identifiants manquants';
  end if;
  if p_target = p_source then
    raise exception 'La fiche cible et la fiche source doivent être différentes';
  end if;

  select organization_id into v_target_org
    from public.companies where id = p_target;
  select organization_id into v_source_org
    from public.companies where id = p_source;

  if v_target_org is null or v_source_org is null then
    raise exception 'Fiche entreprise introuvable';
  end if;
  if v_target_org <> v_source_org then
    raise exception 'Les deux fiches appartiennent à des organisations différentes';
  end if;

  -- Contrôle d'accès : l'appelant doit être admin/manager de l'org.
  if not (
    public.has_org_role(v_target_org, 'admin'::public.app_role) or
    public.has_org_role(v_target_org, 'manager'::public.app_role)
  ) then
    raise exception 'Action réservée aux administrateurs / responsables';
  end if;

  -- Réassigne dynamiquement toutes les colonnes FK pointant vers
  -- companies.id (source -> cible).
  for r in
    select kcu.table_schema, kcu.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name
     and tc.table_schema = ccu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'companies'
      and ccu.column_name = 'id'
  loop
    execute format(
      'update %I.%I set %I = $1 where %I = $2',
      r.table_schema, r.table_name, r.column_name, r.column_name
    ) using p_target, p_source;
  end loop;

  -- Garde-fou : la cible ne doit pas devenir son propre parent.
  update public.companies
    set parent_company_id = null
    where id = p_target and parent_company_id = p_target;

  -- Supprime la fiche source (désormais sans référence entrante).
  delete from public.companies where id = p_source;
end;
$$;

comment on function public.merge_companies(uuid, uuid) is
  'Fusionne la fiche entreprise source dans la cible (réassigne toutes les FK puis supprime la source). Réservé admin/manager. Migration 0117.';

revoke all on function public.merge_companies(uuid, uuid) from public;
grant execute on function public.merge_companies(uuid, uuid) to authenticated;
