"use client";

import { useState } from "react";
import {
  Accessibility,
  Building2,
  Coffee,
  Euro,
  Lightbulb,
  MapPin,
  ShieldCheck,
  Train,
  Video,
} from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { GpsSection } from "./_gps-section";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { PostalCodeCity } from "@/components/postal-code-city";
import { Textarea } from "@/components/ui/textarea";
import {
  APPLICABLE_RI_LABELS,
  LOCATION_KIND_LABELS,
  PARKING_KIND_LABELS,
  PMR_LEVEL_LABELS,
  type FormationLocation,
} from "@/lib/locations/types";

const CONFIGURATION_OPTIONS = [
  "U",
  "Classe",
  "Théâtre",
  "Îlots",
  "Réunion",
] as const;

type LocationFormProps = {
  location?: FormationLocation;
  showCosts: boolean;
};

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function Select({
  id,
  name,
  defaultValue,
  options,
}: {
  id: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Checkbox({
  name,
  defaultChecked,
  label,
}: {
  name: string;
  defaultChecked?: boolean;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked ?? false}
        className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
      />
      <span>{label}</span>
    </label>
  );
}

function TriBool({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: boolean | null;
  label: string;
}) {
  const value =
    defaultValue === true
      ? "true"
      : defaultValue === false
        ? "false"
        : "";
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <select
        name={name}
        defaultValue={value}
        className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
      >
        <option value="">Non renseigné</option>
        <option value="true">Oui</option>
        <option value="false">Non</option>
      </select>
    </div>
  );
}

export function LocationForm({ location, showCosts }: LocationFormProps) {
  const [kind, setKind] = useState(location?.kind ?? "salle_louee");
  const isVisio = kind === "visio";

  return (
    <div className="space-y-4">
      {/* 1 — Identification */}
      <CollapsibleSection
        icon={Building2}
        title="Identification"
        description="Nom, type et adresse du lieu de formation."
        accent="emerald"
        defaultOpen
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nom du lieu" htmlFor="name" required>
              <Input
                id="name"
                name="name"
                required
                defaultValue={location?.name ?? ""}
                placeholder="Ex: Salle Marengo - Centre d'affaires Capnumerique"
              />
            </Field>
            <Field label="Type de lieu" htmlFor="kind">
              <select
                id="kind"
                name="kind"
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as FormationLocation["kind"])
                }
                className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                {Object.entries(LOCATION_KIND_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {!isVisio && (
            <>
              <div className="grid gap-4 md:grid-cols-[2fr_3fr]">
                <Field label="Adresse" htmlFor="address">
                  <Input
                    id="address"
                    name="address"
                    defaultValue={location?.address ?? ""}
                    placeholder="N° et rue"
                  />
                </Field>
                <PostalCodeCity
                  postalCodeName="postal_code"
                  cityName="city"
                  defaultPostalCode={location?.postal_code ?? ""}
                  defaultCity={location?.city ?? ""}
                  gridClassName="grid gap-4 grid-cols-[1fr_3fr]"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Pays" htmlFor="country">
                  <Input
                    id="country"
                    name="country"
                    defaultValue={location?.country ?? "France"}
                  />
                </Field>
                <Field label="Capacité (places)" htmlFor="capacity">
                  <Input
                    id="capacity"
                    name="capacity"
                    type="number"
                    min={0}
                    defaultValue={location?.capacity ?? ""}
                  />
                </Field>
                <Field label="Surface (m²)" htmlFor="surface_m2">
                  <Input
                    id="surface_m2"
                    name="surface_m2"
                    type="number"
                    step="0.5"
                    min={0}
                    defaultValue={location?.surface_m2 ?? ""}
                  />
                </Field>
              </div>

              <div>
                <Label className="text-xs">Configurations possibles</Label>
                <div className="flex flex-wrap gap-3 mt-2">
                  {CONFIGURATION_OPTIONS.map((c) => (
                    <Checkbox
                      key={c}
                      name="configurations"
                      defaultChecked={location?.configurations?.includes(c)}
                      label={c}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nom du contact sur place" htmlFor="contact_name">
              <Input
                id="contact_name"
                name="contact_name"
                defaultValue={location?.contact_name ?? ""}
              />
            </Field>
            <Field label="Gestionnaire / loueur / hôte" htmlFor="manager_name">
              <Input
                id="manager_name"
                name="manager_name"
                defaultValue={location?.manager_name ?? ""}
              />
            </Field>
            <Field label="Téléphone" htmlFor="contact_phone">
              <PhoneInput
                id="contact_phone"
                name="contact_phone"
                defaultValue={location?.contact_phone ?? ""}
              />
            </Field>
            <Field label="Email" htmlFor="contact_email">
              <Input
                id="contact_email"
                name="contact_email"
                type="email"
                defaultValue={location?.contact_email ?? ""}
              />
            </Field>
          </div>
        </div>
      </CollapsibleSection>

      {/* 2 — Visio */}
      {isVisio && (
        <CollapsibleSection
          icon={Video}
          title="Visioconférence"
          description="Plateforme et lien par défaut."
          accent="violet"
          defaultOpen
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Plateforme" htmlFor="videoconf_platform">
              <Input
                id="videoconf_platform"
                name="videoconf_platform"
                defaultValue={location?.videoconf_platform ?? ""}
                placeholder="Zoom, Teams, Google Meet…"
              />
            </Field>
            <Field
              label="Lien par défaut"
              htmlFor="videoconf_default_link"
              hint="Peut être surchargé sur chaque session."
            >
              <Input
                id="videoconf_default_link"
                name="videoconf_default_link"
                type="url"
                defaultValue={location?.videoconf_default_link ?? ""}
                placeholder="https://…"
              />
            </Field>
          </div>
        </CollapsibleSection>
      )}

      {/* 3 — Accès et horaires */}
      {!isVisio && (
        <CollapsibleSection
          icon={Train}
          title="Accès & horaires"
          description="Conditions d'entrée, horaires d'ouverture, parking et transports."
          accent="blue"
        >
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Bâtiment ouvre à" htmlFor="building_open_from">
                <Input
                  id="building_open_from"
                  name="building_open_from"
                  type="time"
                  defaultValue={location?.building_open_from ?? ""}
                />
              </Field>
              <Field label="Bâtiment ferme à" htmlFor="building_open_to">
                <Input
                  id="building_open_to"
                  name="building_open_to"
                  type="time"
                  defaultValue={location?.building_open_to ?? ""}
                />
              </Field>
              <Field label="Accès salle dès" htmlFor="room_access_from">
                <Input
                  id="room_access_from"
                  name="room_access_from"
                  type="time"
                  defaultValue={location?.room_access_from ?? ""}
                />
              </Field>
              <Field label="Accès salle jusqu'à" htmlFor="room_access_to">
                <Input
                  id="room_access_to"
                  name="room_access_to"
                  type="time"
                  defaultValue={location?.room_access_to ?? ""}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Matin début" htmlFor="default_morning_start">
                <Input
                  id="default_morning_start"
                  name="default_morning_start"
                  type="time"
                  defaultValue={location?.default_morning_start ?? ""}
                />
              </Field>
              <Field label="Matin fin" htmlFor="default_morning_end">
                <Input
                  id="default_morning_end"
                  name="default_morning_end"
                  type="time"
                  defaultValue={location?.default_morning_end ?? ""}
                />
              </Field>
              <Field label="A-M début" htmlFor="default_afternoon_start">
                <Input
                  id="default_afternoon_start"
                  name="default_afternoon_start"
                  type="time"
                  defaultValue={location?.default_afternoon_start ?? ""}
                />
              </Field>
              <Field label="A-M fin" htmlFor="default_afternoon_end">
                <Input
                  id="default_afternoon_end"
                  name="default_afternoon_end"
                  type="time"
                  defaultValue={location?.default_afternoon_end ?? ""}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Modalités d'entrée"
                htmlFor="entry_modalities"
                hint="Accueil, badge, code, interphone…"
              >
                <Textarea
                  id="entry_modalities"
                  name="entry_modalities"
                  rows={2}
                  defaultValue={location?.entry_modalities ?? ""}
                />
              </Field>
              <Field
                label="Procédure en cas de retard"
                htmlFor="late_arrival_procedure"
              >
                <Textarea
                  id="late_arrival_procedure"
                  name="late_arrival_procedure"
                  rows={2}
                  defaultValue={location?.late_arrival_procedure ?? ""}
                />
              </Field>
            </div>

            <div>
              <Checkbox
                name="closes_at_lunch"
                defaultChecked={location?.closes_at_lunch}
                label="Le bâtiment ferme entre midi et deux"
              />
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* 4 — Transports */}
      {!isVisio && (
        <CollapsibleSection
          icon={MapPin}
          title="Transports & plan d'accès"
          description="Informations à transmettre aux stagiaires."
          accent="blue"
        >
          <div className="space-y-5">
            <GpsSection location={location} />

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Parking" htmlFor="parking">
                <Select
                  id="parking"
                  name="parking"
                  defaultValue={location?.parking ?? "aucun"}
                  options={Object.entries(PARKING_KIND_LABELS).map(
                    ([k, l]) => ({ value: k, label: l }),
                  )}
                />
              </Field>
              <Field
                label="Précisions parking"
                htmlFor="parking_notes"
                hint="Tarif, places PMR, horaires…"
              >
                <Input
                  id="parking_notes"
                  name="parking_notes"
                  defaultValue={location?.parking_notes ?? ""}
                />
              </Field>
              <Field label="Lien Google Maps / Waze" htmlFor="google_maps_url">
                <Input
                  id="google_maps_url"
                  name="google_maps_url"
                  type="url"
                  defaultValue={location?.google_maps_url ?? ""}
                  placeholder="https://maps.google.com/…"
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Gare la plus proche" htmlFor="nearest_station">
                <Input
                  id="nearest_station"
                  name="nearest_station"
                  defaultValue={location?.nearest_station ?? ""}
                />
              </Field>
              <Field
                label="Distance gare (min à pied)"
                htmlFor="station_distance_min"
              >
                <Input
                  id="station_distance_min"
                  name="station_distance_min"
                  type="number"
                  min={0}
                  defaultValue={location?.station_distance_min ?? ""}
                />
              </Field>
              <Field label="Lignes bus / tram" htmlFor="bus_lines">
                <Input
                  id="bus_lines"
                  name="bus_lines"
                  defaultValue={location?.bus_lines ?? ""}
                />
              </Field>
              <Field
                label="Temps depuis transport (min)"
                htmlFor="walk_time_min"
              >
                <Input
                  id="walk_time_min"
                  name="walk_time_min"
                  type="number"
                  min={0}
                  defaultValue={location?.walk_time_min ?? ""}
                />
              </Field>
            </div>

            <Field
              label="Accès voiture / axes principaux"
              htmlFor="road_access"
            >
              <Textarea
                id="road_access"
                name="road_access"
                rows={2}
                defaultValue={location?.road_access ?? ""}
              />
            </Field>
          </div>
        </CollapsibleSection>
      )}

      {/* 5 — Accessibilité PMR (toujours visible — Qualiopi indicateur 19) */}
      <CollapsibleSection
        icon={Accessibility}
        title="Accessibilité & handicap"
        description="Informations Qualiopi obligatoires (indicateurs 19 et 26)."
        accent="emerald"
        defaultOpen
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Niveau d'accessibilité PMR"
              htmlFor="pmr_accessible"
            >
              <Select
                id="pmr_accessible"
                name="pmr_accessible"
                defaultValue={location?.pmr_accessible ?? "a_verifier"}
                options={Object.entries(PMR_LEVEL_LABELS).map(([k, l]) => ({
                  value: k,
                  label: l,
                }))}
              />
            </Field>
            <Checkbox
              name="handicap_referent_notified"
              defaultChecked={location?.handicap_referent_notified}
              label="Référent handicap informé du lieu"
            />
          </div>

          {!isVisio && (
            <div className="grid gap-4 md:grid-cols-3">
              <TriBool
                name="entry_accessible"
                defaultValue={location?.entry_accessible ?? null}
                label="Entrée accessible"
              />
              <TriBool
                name="has_elevator"
                defaultValue={location?.has_elevator ?? null}
                label="Ascenseur"
              />
              <TriBool
                name="accessible_toilets"
                defaultValue={location?.accessible_toilets ?? null}
                label="Toilettes PMR"
              />
              <TriBool
                name="pmr_parking"
                defaultValue={location?.pmr_parking ?? null}
                label="Place de stationnement PMR"
              />
              <TriBool
                name="adapted_signage"
                defaultValue={location?.adapted_signage ?? null}
                label="Signalétique adaptée"
              />
            </div>
          )}

          <Field
            label="Adaptations possibles"
            htmlFor="adaptation_possibilities"
            hint="Salle au RDC, aide humaine, accueil spécifique, etc."
          >
            <Textarea
              id="adaptation_possibilities"
              name="adaptation_possibilities"
              rows={2}
              defaultValue={location?.adaptation_possibilities ?? ""}
            />
          </Field>

          <Field
            label="Procédure en cas de besoin spécifique"
            htmlFor="specific_needs_procedure"
            hint="Contact préalable, analyse du besoin, adaptation possible…"
          >
            <Textarea
              id="specific_needs_procedure"
              name="specific_needs_procedure"
              rows={2}
              defaultValue={location?.specific_needs_procedure ?? ""}
            />
          </Field>
        </div>
      </CollapsibleSection>

      {/* 6 — Restauration */}
      {!isVisio && (
        <CollapsibleSection
          icon={Coffee}
          title="Restauration & services"
          description="Informations utiles pour la pause déjeuner."
          accent="amber"
        >
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <Checkbox
                name="catering_onsite"
                defaultChecked={location?.catering_onsite}
                label="Restauration sur place"
              />
              <Checkbox
                name="break_room"
                defaultChecked={location?.break_room}
                label="Salle de pause"
              />
              <Checkbox
                name="microwave_fridge"
                defaultChecked={location?.microwave_fridge}
                label="Micro-ondes / frigo"
              />
              <Checkbox
                name="coffee_water"
                defaultChecked={location?.coffee_water}
                label="Café / eau"
              />
              <Checkbox
                name="bakery_nearby"
                defaultChecked={location?.bakery_nearby}
                label="Boulangerie à proximité"
              />
              <Checkbox
                name="delivery_possible"
                defaultChecked={location?.delivery_possible}
                label="Livraison possible"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <Field
                label="Restaurants à proximité"
                htmlFor="nearby_restaurants"
                hint="Nom, distance, type de cuisine."
              >
                <Textarea
                  id="nearby_restaurants"
                  name="nearby_restaurants"
                  rows={2}
                  defaultValue={location?.nearby_restaurants ?? ""}
                />
              </Field>
              <Field
                label="Pause déjeuner (min)"
                htmlFor="default_lunch_duration_min"
              >
                <Input
                  id="default_lunch_duration_min"
                  name="default_lunch_duration_min"
                  type="number"
                  min={0}
                  defaultValue={location?.default_lunch_duration_min ?? 60}
                />
              </Field>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* 7 — Équipements pédagogiques */}
      <CollapsibleSection
        icon={Lightbulb}
        title="Équipements pédagogiques"
        description="Moyens matériels à disposition (Qualiopi indic. 22)."
        accent="violet"
      >
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <Checkbox
              name="eq_tables_chairs"
              defaultChecked={location?.equipment?.tables_chairs}
              label="Tables et chaises adaptées"
            />
            <Checkbox
              name="eq_projector"
              defaultChecked={location?.equipment?.projector}
              label="Vidéoprojecteur / écran"
            />
            <Checkbox
              name="eq_paperboard"
              defaultChecked={location?.equipment?.paperboard}
              label="Paperboard / tableau blanc"
            />
            <Checkbox
              name="eq_wifi"
              defaultChecked={location?.equipment?.wifi}
              label="Wi-Fi disponible"
            />
            <Checkbox
              name="eq_sockets_ok"
              defaultChecked={location?.equipment?.sockets_ok}
              label="Prises électriques suffisantes"
            />
            <Checkbox
              name="eq_sound_system"
              defaultChecked={location?.equipment?.sound_system}
              label="Sonorisation"
            />
            <Checkbox
              name="eq_climate_control"
              defaultChecked={location?.equipment?.climate_control}
              label="Climatisation / chauffage"
            />
            <Checkbox
              name="eq_lighting_ok"
              defaultChecked={location?.equipment?.lighting_ok}
              label="Luminosité correcte"
            />
            <Checkbox
              name="eq_videoconf_capable"
              defaultChecked={location?.equipment?.videoconf_capable}
              label="Possibilité de visio (hybride)"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Code Wi-Fi" htmlFor="eq_wifi_code">
              <Input
                id="eq_wifi_code"
                name="eq_wifi_code"
                defaultValue={location?.equipment?.wifi_code ?? ""}
              />
            </Field>
            <Field
              label="Matériel spécifique métier"
              htmlFor="eq_specific_material_notes"
            >
              <Input
                id="eq_specific_material_notes"
                name="eq_specific_material_notes"
                defaultValue={
                  location?.equipment?.specific_material_notes ?? ""
                }
                placeholder="Ex: 8 PC portables, simulateur…"
              />
            </Field>
          </div>
        </div>
      </CollapsibleSection>

      {/* 8 — Sécurité & règlement intérieur */}
      {!isVisio && (
        <CollapsibleSection
          icon={ShieldCheck}
          title="Sécurité & règlement intérieur"
          description="Conformité Code du travail et Qualiopi."
          accent="rose"
        >
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <Checkbox
                name="fire_consigns_posted"
                defaultChecked={location?.fire_consigns_posted}
                label="Consignes incendie affichées"
              />
              <Checkbox
                name="emergency_exits_identified"
                defaultChecked={location?.emergency_exits_identified}
                label="Issues de secours identifiées"
              />
              <Checkbox
                name="first_aid_kit"
                defaultChecked={location?.first_aid_kit}
                label="Trousse de secours"
              />
              <Checkbox
                name="sanitaries_available"
                defaultChecked={location?.sanitaries_available ?? true}
                label="Sanitaires disponibles"
              />
              <Checkbox
                name="insurance_available"
                defaultChecked={location?.insurance_available}
                label="Attestation d'assurance disponible"
              />
              <Checkbox
                name="security_register_available"
                defaultChecked={location?.security_register_available}
                label="Registre de sécurité disponible"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Point de rassemblement" htmlFor="assembly_point">
                <Input
                  id="assembly_point"
                  name="assembly_point"
                  defaultValue={location?.assembly_point ?? ""}
                />
              </Field>
              <Field
                label="Règlement intérieur applicable"
                htmlFor="applicable_ri"
              >
                <Select
                  id="applicable_ri"
                  name="applicable_ri"
                  defaultValue={
                    location?.applicable_ri ?? "organisme_formation"
                  }
                  options={Object.entries(APPLICABLE_RI_LABELS).map(
                    ([k, l]) => ({ value: k, label: l }),
                  )}
                />
              </Field>
            </div>

            <Field
              label="Règles particulières du site"
              htmlFor="site_specific_rules"
              hint="Badge, EPI, interdictions, consignes spécifiques…"
            >
              <Textarea
                id="site_specific_rules"
                name="site_specific_rules"
                rows={3}
                defaultValue={location?.site_specific_rules ?? ""}
              />
            </Field>
          </div>
        </CollapsibleSection>
      )}

      {/* 9 — Coûts (admin/manager seulement) */}
      {showCosts && !isVisio && (
        <CollapsibleSection
          icon={Euro}
          title="Coûts & contractuel"
          description="🔒 Informations internes — non transmises aux stagiaires."
          accent="amber"
        >
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <Field
                label="Coût demi-journée HT (€)"
                htmlFor="rental_cost_half_day_ht"
              >
                <Input
                  id="rental_cost_half_day_ht"
                  name="rental_cost_half_day_ht"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={location?.rental_cost_half_day_ht ?? ""}
                />
              </Field>
              <Field label="Coût journée HT (€)" htmlFor="rental_cost_day_ht">
                <Input
                  id="rental_cost_day_ht"
                  name="rental_cost_day_ht"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={location?.rental_cost_day_ht ?? ""}
                />
              </Field>
              <Field label="TVA (%)" htmlFor="vat_rate">
                <Input
                  id="vat_rate"
                  name="vat_rate"
                  type="number"
                  step="0.1"
                  min={0}
                  defaultValue={location?.vat_rate ?? 20}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Frais annexes"
                htmlFor="ancillary_costs"
                hint="Café, repas, parking, ménage, matériel."
              >
                <Textarea
                  id="ancillary_costs"
                  name="ancillary_costs"
                  rows={2}
                  defaultValue={location?.ancillary_costs ?? ""}
                />
              </Field>
              <Field
                label="Conditions d'annulation"
                htmlFor="cancellation_terms"
              >
                <Textarea
                  id="cancellation_terms"
                  name="cancellation_terms"
                  rows={2}
                  defaultValue={location?.cancellation_terms ?? ""}
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Modalités de réservation"
                htmlFor="reservation_modalities"
              >
                <Input
                  id="reservation_modalities"
                  name="reservation_modalities"
                  defaultValue={location?.reservation_modalities ?? ""}
                  placeholder="Email, contrat, acompte…"
                />
              </Field>
              <Field label="Validation interne par" htmlFor="validation_owner">
                <Input
                  id="validation_owner"
                  name="validation_owner"
                  defaultValue={location?.validation_owner ?? ""}
                />
              </Field>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* 10 — Méta */}
      <CollapsibleSection
        icon={Building2}
        title="Statut & vérification"
        description="État du lieu et notes internes."
        accent="zinc"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Checkbox
              name="is_active"
              defaultChecked={location?.is_active ?? true}
              label="Lieu actif"
            />
            <Field
              label="Dernière vérification"
              htmlFor="last_verified_at"
              hint="Important en audit Qualiopi."
            >
              <Input
                id="last_verified_at"
                name="last_verified_at"
                type="date"
                defaultValue={location?.last_verified_at ?? ""}
              />
            </Field>
          </div>
          <Field
            label="Notes internes"
            htmlFor="notes_internal"
            hint="Visible uniquement par les équipes."
          >
            <Textarea
              id="notes_internal"
              name="notes_internal"
              rows={3}
              defaultValue={location?.notes_internal ?? ""}
            />
          </Field>
        </div>
      </CollapsibleSection>
    </div>
  );
}
