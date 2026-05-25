-- =========================================================
-- Migration 0105 : Bibliothèque de tests de positionnement
-- =========================================================
-- Avant : 1 seul test hardcodé dans /lib/positioning/types.ts
-- Après : table de templates personnalisables. Chaque template
-- définit les 2 sections qui varient vraiment par formation :
--   - Section 2 'Attentes proposées' (expectation_choices)
--   - Section 5 'Compétences à auto-évaluer' (mastery_criteria)
-- Les autres sections (niveau, prérequis, handicap, adéquation,
-- signature) restent communes — pas de raison qu'elles changent.
--
-- Résolution du template à utiliser pour une session :
--   sessions.positioning_template_id  >
--   formations.positioning_template_id >
--   template default de l'organisation (is_default = true)
--
-- Gilles 2026-05-25.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Table positioning_templates
-- ---------------------------------------------------------
create table if not exists public.positioning_templates (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  title            text not null,
  description      text,
  is_default       boolean not null default false,
  -- Section 2 — Attentes proposées (multi-choix apprenant)
  -- Format : [{ "key": "discover", "label": "Découvrir le sujet" }, ...]
  expectation_choices jsonb not null default '[]'::jsonb,
  -- Section 5 — Compétences à auto-évaluer (échelle non/partiel/maîtrisé)
  -- Format : [{ "key": "basics", "label": "Comprendre les notions de base" }, ...]
  mastery_criteria jsonb not null default '[]'::jsonb,
  status           text not null default 'published'
                     check (status in ('draft','published','archived')),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_positioning_templates_org
  on public.positioning_templates(organization_id);

-- Un seul template par défaut par organisation (au plus)
create unique index if not exists idx_positioning_templates_one_default_per_org
  on public.positioning_templates(organization_id)
  where is_default = true;

create trigger positioning_templates_updated_at
  before update on public.positioning_templates
  for each row execute function public.set_updated_at();

comment on table public.positioning_templates is
  'Bibliothèque de templates de tests de positionnement (Qualiopi). Migration 0105.';
comment on column public.positioning_templates.is_default is
  'Template par défaut de l''organisation (fallback quand ni session ni formation n''en désigne un).';
comment on column public.positioning_templates.expectation_choices is
  'Section 2 — attentes proposées en multi-choix. Format JSONB : [{key, label}].';
comment on column public.positioning_templates.mastery_criteria is
  'Section 5 — compétences à auto-évaluer. Format JSONB : [{key, label}]. NE PAS RENOMMER les keys (référencées dans positioning_responses.data).';

-- ---------------------------------------------------------
-- 2) FK formations.positioning_template_id + sessions
-- ---------------------------------------------------------
alter table public.formations
  add column if not exists positioning_template_id uuid
    references public.positioning_templates(id) on delete set null;

alter table public.sessions
  add column if not exists positioning_template_id uuid
    references public.positioning_templates(id) on delete set null;

comment on column public.formations.positioning_template_id is
  'Template de test de positionnement par défaut pour les sessions issues de cette formation. NULL = utilise le template par défaut de l''organisation. Migration 0105.';
comment on column public.sessions.positioning_template_id is
  'Override du template de test de positionnement pour cette session précise. NULL = hérite de formations.positioning_template_id, puis du template default de l''organisation. Migration 0105.';

-- ---------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------
alter table public.positioning_templates enable row level security;

drop policy if exists "positioning_templates_select_org"
  on public.positioning_templates;
create policy "positioning_templates_select_org"
  on public.positioning_templates for select
  using (public.is_org_member(organization_id));

-- Lecture publique via token apprenant (pour /mon-parcours/[token]/positionnement)
-- — la page utilise déjà createAdminClient donc bypass RLS, on couvre quand même
-- le cas par sécurité.
drop policy if exists "positioning_templates_select_published_public"
  on public.positioning_templates;
create policy "positioning_templates_select_published_public"
  on public.positioning_templates for select
  using (status = 'published');

drop policy if exists "positioning_templates_insert_authorized"
  on public.positioning_templates;
create policy "positioning_templates_insert_authorized"
  on public.positioning_templates for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

drop policy if exists "positioning_templates_update_authorized"
  on public.positioning_templates;
create policy "positioning_templates_update_authorized"
  on public.positioning_templates for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

drop policy if exists "positioning_templates_delete_admin"
  on public.positioning_templates;
create policy "positioning_templates_delete_admin"
  on public.positioning_templates for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));

-- ---------------------------------------------------------
-- 4) SEED : pour chaque organisation existante, créer un
--    template 'CAP NUMERIQUE - Par défaut' avec les valeurs
--    actuellement hardcodées dans le code (transition douce).
-- ---------------------------------------------------------
insert into public.positioning_templates (
  organization_id, title, description, is_default,
  expectation_choices, mastery_criteria, status
)
select
  o.id,
  'Test de positionnement — Par défaut',
  'Modèle générique livré par CAP NUMERIQUE. Sert de socle pour toutes les sessions ; éditez-le ou créez-en d''autres pour personnaliser les compétences à auto-évaluer selon la thématique de la formation.',
  true,
  '[
    {"key": "discover", "label": "Découvrir le sujet"},
    {"key": "consolidate", "label": "Consolider mes bases"},
    {"key": "autonomy", "label": "Gagner en autonomie"},
    {"key": "secure_practice", "label": "Sécuriser mes pratiques professionnelles"},
    {"key": "perfect", "label": "Me perfectionner"},
    {"key": "solve_issue", "label": "Résoudre une difficulté concrète"}
  ]'::jsonb,
  '[
    {"key": "basics", "label": "Comprendre les notions de base"},
    {"key": "rules", "label": "Identifier les règles ou obligations principales"},
    {"key": "best_practices", "label": "Appliquer les bonnes pratiques"},
    {"key": "errors", "label": "Repérer les erreurs ou pièges à éviter"}
  ]'::jsonb,
  'published'
from public.organizations o
where not exists (
  select 1 from public.positioning_templates t
  where t.organization_id = o.id and t.is_default = true
);
