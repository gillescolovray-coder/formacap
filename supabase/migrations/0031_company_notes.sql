-- =========================================================
-- Migration 0031 : notes datées sur fiche entreprise
-- =========================================================
-- Objectif : remplacer la simple zone "notes" par un journal
-- horodaté de notes internes, chacune avec une éventuelle action
-- (à rappeler, à relancer, RDV planifié…). Permet de suivre le
-- relationnel commercial dans le temps.
-- =========================================================

create table public.company_notes (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  content      text not null,
  -- Type d'action associé à la note ; null = note simple
  action_type  text check (action_type in (
    'a_rappeler',
    'a_relancer',
    'rdv_planifie',
    'devis_envoye',
    'email_envoye',
    'document_recu',
    'info',
    'autre'
  )),
  -- Date à laquelle l'action doit être effectuée (optionnel)
  due_date     date,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id)
);

create index idx_company_notes_company on public.company_notes(company_id, created_at desc);

comment on table public.company_notes is
  'Journal de notes datées sur une fiche entreprise (action commerciale, suivi…).';
comment on column public.company_notes.action_type is
  'Type d''action : a_rappeler, a_relancer, rdv_planifie, devis_envoye, email_envoye, document_recu, info, autre.';
comment on column public.company_notes.due_date is
  'Date prévue pour l''action (ex : à rappeler le ...). Null = pas d''échéance.';

-- ---------------------------------------------------------
-- RLS : cascade via la fiche entreprise
-- ---------------------------------------------------------
alter table public.company_notes enable row level security;

create policy "company_notes_select_org"
  on public.company_notes for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and public.is_org_member(c.organization_id)
    )
  );

create policy "company_notes_insert_authorized"
  on public.company_notes for insert
  with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and (
          public.has_org_role(c.organization_id, 'admin'::public.app_role) or
          public.has_org_role(c.organization_id, 'manager'::public.app_role) or
          public.has_org_role(c.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );

create policy "company_notes_update_authorized"
  on public.company_notes for update
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and (
          public.has_org_role(c.organization_id, 'admin'::public.app_role) or
          public.has_org_role(c.organization_id, 'manager'::public.app_role) or
          public.has_org_role(c.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );

create policy "company_notes_delete_authorized"
  on public.company_notes for delete
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and (
          public.has_org_role(c.organization_id, 'admin'::public.app_role) or
          public.has_org_role(c.organization_id, 'manager'::public.app_role) or
          public.has_org_role(c.organization_id, 'pedagogy_lead'::public.app_role)
        )
    )
  );
