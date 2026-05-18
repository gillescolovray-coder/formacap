"use client";

import { useEffect } from "react";
import {
  APPLICABLE_RI_LABELS,
  LOCATION_KIND_LABELS,
  PARKING_KIND_LABELS,
  PMR_LEVEL_LABELS,
  type FormationLocation,
} from "@/lib/locations/types";

type Props = {
  location: FormationLocation;
  mode: "interne" | "stagiaire";
  orgName: string;
  orgLogo: string | null;
};

function YN(value: boolean | null | undefined): string {
  if (value === true) return "Oui";
  if (value === false) return "Non";
  return "—";
}

function emptyText(value: string | null | undefined): string {
  if (!value || value.trim() === "") return "—";
  return value;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-slate-100 last:border-0">
      <span className="text-slate-600 text-xs">{label}</span>
      <span className="font-medium text-right text-xs">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid mb-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-700 border-b-2 border-cyan-600 pb-1 mb-2">
        {title}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

export function LocationFichePrint({
  location,
  mode,
  orgName,
  orgLogo,
}: Props) {
  useEffect(() => {
    // Lance automatiquement la boîte d'impression dès que la fiche est chargée
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  const isInterne = mode === "interne";
  const fullAddress = [
    location.address,
    location.postal_code,
    location.city,
    location.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="bg-white text-slate-900 min-h-screen">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="no-print sticky top-0 bg-cyan-600 text-white px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-medium">
          {isInterne ? "Fiche interne" : "Fiche pratique stagiaire"} — astuce :
          Ctrl+P pour enregistrer en PDF
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-white text-cyan-700 px-3 py-1 text-xs font-semibold hover:bg-cyan-50"
        >
          Imprimer
        </button>
      </div>

      <div className="max-w-[210mm] mx-auto p-10 text-[12px] leading-relaxed">
        {/* En-tête */}
        <header className="flex items-start justify-between gap-4 mb-6 pb-4 border-b-4 border-cyan-600">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-700 font-bold mb-1">
              {isInterne
                ? "Fiche de référencement — usage interne"
                : "Fiche pratique stagiaire"}
            </p>
            <h1 className="text-2xl font-black tracking-tight">
              {location.name}
            </h1>
            <p className="text-slate-500 mt-1">
              {LOCATION_KIND_LABELS[location.kind]}
              {fullAddress && ` · ${fullAddress}`}
            </p>
          </div>
          <div className="text-right text-[10px] text-slate-500">
            {orgLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={orgLogo}
                alt={orgName}
                className="max-h-16 max-w-[120px] object-contain ml-auto mb-2"
              />
            )}
            <p className="font-semibold text-slate-700">{orgName}</p>
            <p>Édité le {new Date().toLocaleDateString("fr-FR")}</p>
            {location.last_verified_at && (
              <p>
                Vérifié le{" "}
                {new Date(location.last_verified_at).toLocaleDateString(
                  "fr-FR",
                )}
              </p>
            )}
          </div>
        </header>

        {/* 1 — Adresse & contact */}
        <Section title="Adresse & contact">
          <Row label="Adresse complète" value={emptyText(fullAddress)} />
          {location.google_maps_url && (
            <Row
              label="Plan d'accès"
              value={
                <a
                  href={location.google_maps_url}
                  className="text-cyan-700 underline"
                >
                  Voir sur Google Maps
                </a>
              }
            />
          )}
          <Row label="Contact sur place" value={emptyText(location.contact_name)} />
          <Row label="Téléphone" value={emptyText(location.contact_phone)} />
          <Row label="Email" value={emptyText(location.contact_email)} />
          {isInterne && (
            <Row
              label="Gestionnaire / loueur"
              value={emptyText(location.manager_name)}
            />
          )}
          {isInterne && (
            <>
              <Row
                label="Capacité"
                value={
                  location.capacity ? `${location.capacity} pers.` : "—"
                }
              />
              <Row
                label="Surface"
                value={location.surface_m2 ? `${location.surface_m2} m²` : "—"}
              />
              {location.configurations && location.configurations.length > 0 && (
                <Row
                  label="Configurations"
                  value={location.configurations.join(", ")}
                />
              )}
            </>
          )}
        </Section>

        {/* 2 — Horaires & accès */}
        {location.kind !== "visio" && (
          <Section title="Horaires & accès">
            <Row
              label="Bâtiment ouvert"
              value={
                location.building_open_from && location.building_open_to
                  ? `${location.building_open_from} – ${location.building_open_to}`
                  : "—"
              }
            />
            <Row
              label="Accès salle"
              value={
                location.room_access_from && location.room_access_to
                  ? `${location.room_access_from} – ${location.room_access_to}`
                  : "—"
              }
            />
            <Row
              label="Horaires de formation"
              value={
                location.default_morning_start
                  ? `${location.default_morning_start ?? "—"}–${location.default_morning_end ?? "—"} / ${location.default_afternoon_start ?? "—"}–${location.default_afternoon_end ?? "—"}`
                  : "—"
              }
            />
            <Row
              label="Modalités d'entrée"
              value={emptyText(location.entry_modalities)}
            />
            <Row
              label="En cas de retard"
              value={emptyText(location.late_arrival_procedure)}
            />
            <Row
              label="Fermeture pause déjeuner"
              value={location.closes_at_lunch ? "Oui" : "Non"}
            />
          </Section>
        )}

        {/* 3 — Transports */}
        {location.kind !== "visio" && (
          <Section title="Transports & stationnement">
            <Row
              label="Parking"
              value={
                <>
                  {PARKING_KIND_LABELS[location.parking]}
                  {location.parking_notes && ` — ${location.parking_notes}`}
                </>
              }
            />
            <Row
              label="Gare la plus proche"
              value={
                location.nearest_station
                  ? `${location.nearest_station}${location.station_distance_min ? ` (${location.station_distance_min} min à pied)` : ""}`
                  : "—"
              }
            />
            <Row label="Bus / tram" value={emptyText(location.bus_lines)} />
            <Row
              label="Temps depuis transport"
              value={
                location.walk_time_min ? `${location.walk_time_min} min` : "—"
              }
            />
            <Row label="Accès voiture" value={emptyText(location.road_access)} />
          </Section>
        )}

        {/* 4 — Accessibilité (toujours visible — Qualiopi) */}
        <Section title="Accessibilité & handicap">
          <Row
            label="Niveau d'accessibilité PMR"
            value={PMR_LEVEL_LABELS[location.pmr_accessible]}
          />
          {location.kind !== "visio" && (
            <>
              <Row
                label="Entrée accessible"
                value={YN(location.entry_accessible)}
              />
              <Row label="Ascenseur" value={YN(location.has_elevator)} />
              <Row
                label="Toilettes PMR"
                value={YN(location.accessible_toilets)}
              />
              <Row
                label="Stationnement PMR"
                value={YN(location.pmr_parking)}
              />
              <Row
                label="Signalétique adaptée"
                value={YN(location.adapted_signage)}
              />
            </>
          )}
          <Row
            label="Adaptations possibles"
            value={emptyText(location.adaptation_possibilities)}
          />
          <Row
            label="Procédure besoin spécifique"
            value={emptyText(location.specific_needs_procedure)}
          />
          {isInterne && (
            <Row
              label="Référent handicap informé"
              value={location.handicap_referent_notified ? "Oui" : "Non"}
            />
          )}
        </Section>

        {/* 5 — Restauration */}
        {location.kind !== "visio" && (
          <Section title="Restauration & services">
            <Row
              label="Restauration sur place"
              value={location.catering_onsite ? "Oui" : "Non"}
            />
            <Row
              label="Salle de pause"
              value={location.break_room ? "Oui" : "Non"}
            />
            <Row
              label="Micro-ondes / frigo"
              value={location.microwave_fridge ? "Oui" : "Non"}
            />
            <Row
              label="Café / eau"
              value={location.coffee_water ? "Oui" : "Non"}
            />
            <Row
              label="Restaurants à proximité"
              value={emptyText(location.nearby_restaurants)}
            />
            <Row
              label="Boulangerie à proximité"
              value={location.bakery_nearby ? "Oui" : "Non"}
            />
            <Row
              label="Pause déjeuner"
              value={
                location.default_lunch_duration_min
                  ? `${location.default_lunch_duration_min} min`
                  : "—"
              }
            />
          </Section>
        )}

        {/* 6 — Équipements (interne uniquement, ou visio pour les détails techniques) */}
        {(isInterne || location.kind === "visio") && (
          <Section title="Équipements pédagogiques">
            <Row
              label="Tables / chaises"
              value={location.equipment?.tables_chairs ? "Oui" : "Non"}
            />
            <Row
              label="Vidéoprojecteur"
              value={location.equipment?.projector ? "Oui" : "Non"}
            />
            <Row
              label="Paperboard / tableau"
              value={location.equipment?.paperboard ? "Oui" : "Non"}
            />
            <Row
              label="Wi-Fi"
              value={
                location.equipment?.wifi
                  ? location.equipment.wifi_code
                    ? `Oui (code : ${location.equipment.wifi_code})`
                    : "Oui"
                  : "Non"
              }
            />
            <Row
              label="Prises électriques"
              value={location.equipment?.sockets_ok ? "Oui" : "Non"}
            />
            <Row
              label="Sonorisation"
              value={location.equipment?.sound_system ? "Oui" : "Non"}
            />
            <Row
              label="Climatisation / chauffage"
              value={location.equipment?.climate_control ? "Oui" : "Non"}
            />
            <Row
              label="Visio / hybride"
              value={location.equipment?.videoconf_capable ? "Oui" : "Non"}
            />
            {location.equipment?.specific_material_notes && (
              <Row
                label="Matériel spécifique"
                value={location.equipment.specific_material_notes}
              />
            )}
          </Section>
        )}

        {/* Visio infos */}
        {location.kind === "visio" && (
          <Section title="Visioconférence">
            <Row
              label="Plateforme"
              value={emptyText(location.videoconf_platform)}
            />
            <Row
              label="Lien par défaut"
              value={
                location.videoconf_default_link ? (
                  <a
                    href={location.videoconf_default_link}
                    className="text-cyan-700 underline break-all"
                  >
                    {location.videoconf_default_link}
                  </a>
                ) : (
                  "—"
                )
              }
            />
          </Section>
        )}

        {/* 7 — Sécurité (interne uniquement) */}
        {isInterne && location.kind !== "visio" && (
          <Section title="Sécurité, hygiène & règlement">
            <Row
              label="Consignes incendie affichées"
              value={location.fire_consigns_posted ? "Oui" : "Non"}
            />
            <Row
              label="Issues de secours identifiées"
              value={location.emergency_exits_identified ? "Oui" : "Non"}
            />
            <Row
              label="Point de rassemblement"
              value={emptyText(location.assembly_point)}
            />
            <Row
              label="Trousse de secours"
              value={location.first_aid_kit ? "Oui" : "Non"}
            />
            <Row
              label="Sanitaires disponibles"
              value={location.sanitaries_available ? "Oui" : "Non"}
            />
            <Row
              label="Règlement intérieur applicable"
              value={APPLICABLE_RI_LABELS[location.applicable_ri]}
            />
            <Row
              label="Règles particulières du site"
              value={emptyText(location.site_specific_rules)}
            />
            <Row
              label="Attestation d'assurance"
              value={location.insurance_available ? "Disponible" : "—"}
            />
            <Row
              label="Registre de sécurité"
              value={
                location.security_register_available ? "Disponible" : "—"
              }
            />
          </Section>
        )}

        {/* 8 — Coûts (interne + role admin/manager déjà filtré côté serveur via showCosts ; on affiche si valeurs présentes) */}
        {isInterne &&
          (location.rental_cost_half_day_ht !== null ||
            location.rental_cost_day_ht !== null ||
            location.ancillary_costs ||
            location.cancellation_terms) && (
            <Section title="Coûts & contractuel (usage interne)">
              <Row
                label="Coût demi-journée HT"
                value={
                  location.rental_cost_half_day_ht
                    ? `${location.rental_cost_half_day_ht.toFixed(2)} €`
                    : "—"
                }
              />
              <Row
                label="Coût journée HT"
                value={
                  location.rental_cost_day_ht
                    ? `${location.rental_cost_day_ht.toFixed(2)} €`
                    : "—"
                }
              />
              <Row
                label="TVA"
                value={
                  location.vat_rate !== null ? `${location.vat_rate} %` : "—"
                }
              />
              <Row
                label="Frais annexes"
                value={emptyText(location.ancillary_costs)}
              />
              <Row
                label="Conditions d'annulation"
                value={emptyText(location.cancellation_terms)}
              />
              <Row
                label="Modalités de réservation"
                value={emptyText(location.reservation_modalities)}
              />
              <Row
                label="Validation interne par"
                value={emptyText(location.validation_owner)}
              />
            </Section>
          )}

        {/* Notes internes */}
        {isInterne && location.notes_internal && (
          <Section title="Notes internes">
            <p className="whitespace-pre-wrap text-xs">
              {location.notes_internal}
            </p>
          </Section>
        )}

        {/* Footer Qualiopi */}
        <footer className="mt-8 pt-4 border-t border-slate-200 text-[10px] text-slate-400">
          {isInterne ? (
            <p>
              Document interne — preuve de référencement Qualiopi (indicateurs
              6, 19, 22, 26). À conserver pour audit.
            </p>
          ) : (
            <p>
              Pour toute question d&apos;accessibilité ou besoin spécifique,
              contactez {orgName} au préalable.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
