-- =========================================================
-- Migration 0013 : Lieux de formation (Qualiopi)
-- =========================================================
-- Objectif : référentiel des lieux où se déroulent les sessions.
-- Couvre les indicateurs Qualiopi 6 (information du public),
-- 19 (handicap), 22 (moyens et locaux), 26 (référent handicap).
-- =========================================================

-- Type enum : nature du lieu
create type public.location_kind as enum (
  'salle_interne',     -- locaux de l'OF
  'salle_louee',       -- location ponctuelle
  'mise_a_disposition',-- mairie, partenaire
  'chez_client',       -- locaux d'une entreprise cliente
  'visio'              -- 100 % distanciel
);

-- Type enum : niveau d'accessibilité PMR
create type public.pmr_level as enum (
  'oui',
  'partiel',
  'non',
  'a_verifier'
);

-- Type enum : type de parking
create type public.parking_kind as enum (
  'gratuit',
  'payant',
  'reserve',
  'public_proche',
  'aucun'
);

-- Type enum : règlement intérieur applicable
create type public.applicable_ri as enum (
  'organisme_formation',
  'site_accueil'
);

-- ---------------------------------------------------------
-- Table: formation_locations
-- ---------------------------------------------------------
create table public.formation_locations (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,

  -- Identification
  name                        text not null,
  kind                        public.location_kind not null default 'salle_louee',
  address                     text,
  postal_code                 text,
  city                        text,
  country                     text default 'France',

  -- Contacts
  contact_name                text,
  contact_phone               text,
  contact_email               text,
  manager_name                text,             -- gestionnaire / loueur / hôte

  -- Capacité & configuration
  capacity                    int,
  surface_m2                  numeric(6,2),
  configurations              text[],           -- ex: {'U','classe','theatre','ilots'}

  -- Horaires & accès
  building_open_from          time,
  building_open_to            time,
  room_access_from            time,
  room_access_to              time,
  default_morning_start       time,
  default_morning_end         time,
  default_afternoon_start     time,
  default_afternoon_end       time,
  entry_modalities            text,             -- accueil, badge, code, interphone
  late_arrival_procedure      text,
  closes_at_lunch             boolean default false,

  -- Transports & parking
  parking                     public.parking_kind default 'aucun',
  parking_notes               text,
  nearest_station             text,
  station_distance_min        int,
  bus_lines                   text,
  walk_time_min               int,
  road_access                 text,
  google_maps_url             text,

  -- Accessibilité PMR (Qualiopi indic. 19)
  pmr_accessible              public.pmr_level default 'a_verifier',
  entry_accessible            boolean,
  has_elevator                boolean,
  accessible_toilets          boolean,
  pmr_parking                 boolean,
  adapted_signage             boolean,
  adaptation_possibilities    text,
  handicap_referent_notified  boolean default false,
  specific_needs_procedure    text,

  -- Restauration & services
  catering_onsite             boolean default false,
  break_room                  boolean default false,
  microwave_fridge            boolean default false,
  coffee_water                boolean default false,
  nearby_restaurants          text,
  bakery_nearby               boolean default false,
  delivery_possible           boolean default false,
  default_lunch_duration_min  int default 60,

  -- Équipements pédagogiques (jsonb pour souplesse)
  equipment                   jsonb not null default '{}'::jsonb,
  -- Clés attendues : tables_chairs, projector, paperboard, wifi, wifi_code,
  --                  sockets_ok, sound_system, climate_control, lighting_ok,
  --                  videoconf_capable, specific_material_notes

  -- Sécurité & règlement
  fire_consigns_posted        boolean default false,
  emergency_exits_identified  boolean default false,
  assembly_point              text,
  first_aid_kit               boolean default false,
  sanitaries_available        boolean default true,
  site_specific_rules         text,
  applicable_ri               public.applicable_ri default 'organisme_formation',
  insurance_available         boolean default false,
  security_register_available boolean default false,

  -- Visio (si kind = 'visio')
  videoconf_default_link      text,
  videoconf_platform          text,             -- Zoom, Teams, Meet...

  -- Coûts (admin/manager seulement, contrôlé côté UI)
  rental_cost_half_day_ht     numeric(10,2),
  rental_cost_day_ht          numeric(10,2),
  vat_rate                    numeric(5,2) default 20.00,
  ancillary_costs             text,
  cancellation_terms          text,
  reservation_modalities      text,
  validation_owner            text,

  -- Documents (jsonb : photos, plan, attestation ERP, devis, facture)
  documents                   jsonb not null default '[]'::jsonb,
  -- Format attendu : [{kind, file_url, file_name, label, uploaded_at}]

  -- Méta & gestion
  is_active                   boolean not null default true,
  last_verified_at            date,
  notes_internal              text,
  created_by                  uuid references public.profiles(id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_locations_org      on public.formation_locations(organization_id);
create index idx_locations_kind     on public.formation_locations(kind);
create index idx_locations_active   on public.formation_locations(organization_id, is_active);
create index idx_locations_name     on public.formation_locations(organization_id, name);

create trigger formation_locations_updated_at
  before update on public.formation_locations
  for each row execute function public.set_updated_at();

comment on table public.formation_locations is
  'Référentiel des lieux de formation (salle interne, louée, client, visio).';

-- ---------------------------------------------------------
-- Lien depuis sessions vers le lieu
-- ---------------------------------------------------------
alter table public.sessions
  add column if not exists location_id uuid
    references public.formation_locations(id) on delete set null;

create index if not exists idx_sessions_location
  on public.sessions(location_id);

comment on column public.sessions.location_id is
  'Lieu de formation référencé (le champ texte location reste pour la rétrocompatibilité).';

-- ---------------------------------------------------------
-- RLS : formation_locations
-- ---------------------------------------------------------
alter table public.formation_locations enable row level security;

create policy "locations_select_org"
  on public.formation_locations for select
  using (public.is_org_member(organization_id));

create policy "locations_insert_authorized"
  on public.formation_locations for insert
  with check (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "locations_update_authorized"
  on public.formation_locations for update
  using (
    public.has_org_role(organization_id, 'admin'::public.app_role) or
    public.has_org_role(organization_id, 'manager'::public.app_role) or
    public.has_org_role(organization_id, 'pedagogy_lead'::public.app_role)
  );

create policy "locations_delete_admin"
  on public.formation_locations for delete
  using (public.has_org_role(organization_id, 'admin'::public.app_role));

-- ---------------------------------------------------------
-- Storage : bucket pour les documents de lieux
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('formation-locations', 'formation-locations', true)
on conflict (id) do nothing;

drop policy if exists "formation_locations_public_read" on storage.objects;
create policy "formation_locations_public_read"
  on storage.objects for select
  using (bucket_id = 'formation-locations');

drop policy if exists "formation_locations_insert" on storage.objects;
create policy "formation_locations_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'formation-locations'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.is_active
        and m.role in (
          'admin'::public.app_role,
          'manager'::public.app_role,
          'pedagogy_lead'::public.app_role
        )
    )
  );

drop policy if exists "formation_locations_update" on storage.objects;
create policy "formation_locations_update"
  on storage.objects for update
  using (
    bucket_id = 'formation-locations'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.is_active
        and m.role in (
          'admin'::public.app_role,
          'manager'::public.app_role,
          'pedagogy_lead'::public.app_role
        )
    )
  );

drop policy if exists "formation_locations_delete" on storage.objects;
create policy "formation_locations_delete"
  on storage.objects for delete
  using (
    bucket_id = 'formation-locations'
    and exists (
      select 1 from public.organization_members m
      where m.profile_id = auth.uid()
        and m.is_active
        and m.role = 'admin'::public.app_role
    )
  );
