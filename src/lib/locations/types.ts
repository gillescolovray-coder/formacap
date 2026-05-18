export type LocationKind =
  | "salle_interne"
  | "salle_louee"
  | "mise_a_disposition"
  | "chez_client"
  | "visio";

export type PmrLevel = "oui" | "partiel" | "non" | "a_verifier";

export type ParkingKind =
  | "gratuit"
  | "payant"
  | "reserve"
  | "public_proche"
  | "aucun";

export type ApplicableRi = "organisme_formation" | "site_accueil";

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  salle_interne: "Salle interne",
  salle_louee: "Salle louée",
  mise_a_disposition: "Mise à disposition",
  chez_client: "Chez le client",
  visio: "Visioconférence",
};

export const PMR_LEVEL_LABELS: Record<PmrLevel, string> = {
  oui: "Accessible",
  partiel: "Partiellement accessible",
  non: "Non accessible",
  a_verifier: "À vérifier",
};

export const PARKING_KIND_LABELS: Record<ParkingKind, string> = {
  gratuit: "Parking gratuit",
  payant: "Parking payant",
  reserve: "Parking réservé",
  public_proche: "Parking public à proximité",
  aucun: "Pas de parking",
};

export const APPLICABLE_RI_LABELS: Record<ApplicableRi, string> = {
  organisme_formation: "Règlement intérieur de l'organisme",
  site_accueil: "Règlement intérieur du site d'accueil",
};

export const LOCATION_KIND_BADGE_CLASSES: Record<LocationKind, string> = {
  salle_interne:
    "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
  salle_louee:
    "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
  mise_a_disposition:
    "bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-900",
  chez_client:
    "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
  visio:
    "bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-900",
};

export const PMR_LEVEL_BADGE_CLASSES: Record<PmrLevel, string> = {
  oui: "bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-900",
  partiel:
    "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
  non: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900",
  a_verifier:
    "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

export type LocationEquipment = {
  tables_chairs?: boolean;
  projector?: boolean;
  paperboard?: boolean;
  wifi?: boolean;
  wifi_code?: string;
  sockets_ok?: boolean;
  sound_system?: boolean;
  climate_control?: boolean;
  lighting_ok?: boolean;
  videoconf_capable?: boolean;
  specific_material_notes?: string;
};

export type LocationDocumentKind =
  | "photo"
  | "plan"
  | "erp"
  | "register"
  | "devis"
  | "facture"
  | "contrat"
  | "autre";

export const LOCATION_DOCUMENT_KIND_LABELS: Record<
  LocationDocumentKind,
  string
> = {
  photo: "Photo de salle",
  plan: "Plan d'accès",
  erp: "Attestation ERP",
  register: "Registre d'accessibilité",
  devis: "Devis",
  facture: "Facture",
  contrat: "Contrat de location",
  autre: "Autre",
};

export type LocationDocument = {
  kind: LocationDocumentKind;
  file_url: string;
  file_name: string;
  label?: string;
  uploaded_at: string;
};

export type FormationLocation = {
  id: string;
  organization_id: string;

  // Identification
  name: string;
  kind: LocationKind;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;

  // Contacts
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  manager_name: string | null;

  // Capacité
  capacity: number | null;
  surface_m2: number | null;
  configurations: string[] | null;

  // Horaires
  building_open_from: string | null;
  building_open_to: string | null;
  room_access_from: string | null;
  room_access_to: string | null;
  default_morning_start: string | null;
  default_morning_end: string | null;
  default_afternoon_start: string | null;
  default_afternoon_end: string | null;
  entry_modalities: string | null;
  late_arrival_procedure: string | null;
  closes_at_lunch: boolean;

  // GPS
  latitude: number | null;
  longitude: number | null;
  gps_source: "auto" | "manual" | null;
  gps_updated_at: string | null;

  // Transports
  parking: ParkingKind;
  parking_notes: string | null;
  nearest_station: string | null;
  station_distance_min: number | null;
  bus_lines: string | null;
  walk_time_min: number | null;
  road_access: string | null;
  google_maps_url: string | null;

  // PMR
  pmr_accessible: PmrLevel;
  entry_accessible: boolean | null;
  has_elevator: boolean | null;
  accessible_toilets: boolean | null;
  pmr_parking: boolean | null;
  adapted_signage: boolean | null;
  adaptation_possibilities: string | null;
  handicap_referent_notified: boolean;
  specific_needs_procedure: string | null;

  // Restauration
  catering_onsite: boolean;
  break_room: boolean;
  microwave_fridge: boolean;
  coffee_water: boolean;
  nearby_restaurants: string | null;
  bakery_nearby: boolean;
  delivery_possible: boolean;
  default_lunch_duration_min: number | null;

  // Équipements
  equipment: LocationEquipment;

  // Sécurité
  fire_consigns_posted: boolean;
  emergency_exits_identified: boolean;
  assembly_point: string | null;
  first_aid_kit: boolean;
  sanitaries_available: boolean;
  site_specific_rules: string | null;
  applicable_ri: ApplicableRi;
  insurance_available: boolean;
  security_register_available: boolean;

  // Visio
  videoconf_default_link: string | null;
  videoconf_platform: string | null;

  // Coûts
  rental_cost_half_day_ht: number | null;
  rental_cost_day_ht: number | null;
  vat_rate: number | null;
  ancillary_costs: string | null;
  cancellation_terms: string | null;
  reservation_modalities: string | null;
  validation_owner: string | null;

  // Documents
  documents: LocationDocument[];

  // Méta
  is_active: boolean;
  last_verified_at: string | null;
  notes_internal: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
