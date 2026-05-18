"use client";

import { useMemo, useState } from "react";
import {
  Accessibility,
  Building2,
  CheckCircle2,
  MapPin,
  Search,
  Users,
  Video,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  LOCATION_KIND_BADGE_CLASSES,
  LOCATION_KIND_LABELS,
  PMR_LEVEL_BADGE_CLASSES,
  PMR_LEVEL_LABELS,
  type LocationKind,
  type PmrLevel,
} from "@/lib/locations/types";

export type LocationPickerItem = {
  id: string;
  name: string;
  kind: LocationKind;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  capacity: number | null;
  pmr_accessible: PmrLevel;
};

type Props = {
  locations: LocationPickerItem[];
  defaultValue?: string | null;
  /** Notifie le parent quand le lieu sélectionné change (ou est vidé). */
  onChange?: (id: string) => void;
};

const KIND_ICONS: Record<LocationKind, typeof Building2> = {
  salle_interne: Building2,
  salle_louee: Building2,
  mise_a_disposition: Building2,
  chez_client: Building2,
  visio: Video,
};

export function LocationPicker({ locations, defaultValue, onChange }: Props) {
  const [selectedId, setSelectedIdState] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<LocationKind | "">("");
  const [pmrOnly, setPmrOnly] = useState(false);

  const setSelectedId = (id: string) => {
    setSelectedIdState(id);
    onChange?.(id);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return locations.filter((l) => {
      if (kindFilter && l.kind !== kindFilter) return false;
      if (pmrOnly && l.pmr_accessible !== "oui") return false;
      if (q) {
        const text = [l.name, l.city ?? "", l.address ?? ""]
          .join(" ")
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [locations, query, kindFilter, pmrOnly]);

  const selected = locations.find((l) => l.id === selectedId);

  return (
    <div className="space-y-3">
      <input type="hidden" name="location_id" value={selectedId} />

      {/* Carte sélectionnée */}
      {selected ? (
        <div className="rounded-xl border-2 border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-cyan-700 dark:text-cyan-400 mb-0.5">
              Lieu sélectionné
            </p>
            <p className="text-base font-bold tracking-tight">
              {selected.name}
            </p>
            {(selected.address || selected.city) && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                {[selected.address, selected.postal_code, selected.city]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium",
                  LOCATION_KIND_BADGE_CLASSES[selected.kind],
                )}
              >
                {LOCATION_KIND_LABELS[selected.kind]}
              </span>
              {selected.capacity !== null && (
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  <Users className="h-3 w-3" />
                  {selected.capacity} pers.
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium",
                  PMR_LEVEL_BADGE_CLASSES[selected.pmr_accessible],
                )}
              >
                <Accessibility className="h-3 w-3" />
                {PMR_LEVEL_LABELS[selected.pmr_accessible]}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedId("")}
            className="text-xs text-slate-500 hover:text-red-600 underline"
          >
            Changer
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-900/30 p-3 text-xs text-slate-500 italic">
          Aucun lieu sélectionné — vous pouvez aussi laisser vide et utiliser
          la saisie libre ci-dessous.
        </div>
      )}

      {/* Picker (toujours visible si pas de sélection, ou caché si sélectionné) */}
      {!selected && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              type="search"
              placeholder="Rechercher par nom, ville, adresse…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filtres types de lieu */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mr-1">
              Type :
            </span>
            <button
              type="button"
              onClick={() => setKindFilter("")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                kindFilter === ""
                  ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900"
                  : "bg-white dark:bg-slate-900 text-slate-600 border-slate-300 dark:border-slate-700 hover:border-slate-500",
              )}
            >
              Tous
            </button>
            {(
              Object.keys(LOCATION_KIND_LABELS) as LocationKind[]
            ).map((k) => {
              const Icon = KIND_ICONS[k];
              const isActive = kindFilter === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(isActive ? "" : k)}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                    isActive
                      ? LOCATION_KIND_BADGE_CLASSES[k] +
                          " ring-2 ring-offset-1 ring-slate-900 dark:ring-white"
                      : "bg-white dark:bg-slate-900 text-slate-600 border-slate-300 dark:border-slate-700 hover:border-slate-500",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {LOCATION_KIND_LABELS[k]}
                </button>
              );
            })}
            <label className="inline-flex items-center gap-1.5 ml-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={pmrOnly}
                onChange={(e) => setPmrOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600"
              />
              <Accessibility className="h-3 w-3 text-cyan-600" />
              <span className="text-slate-600">PMR uniquement</span>
            </label>
          </div>

          <p className="text-xs text-slate-500">
            {filtered.length} lieu{filtered.length > 1 ? "x" : ""} disponible
            {filtered.length > 1 ? "s" : ""}
            {locations.length !== filtered.length
              ? ` sur ${locations.length}`
              : ""}
          </p>

          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/50">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Aucun lieu ne correspond.
                {(query || kindFilter || pmrOnly) && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setKindFilter("");
                      setPmrOnly(false);
                    }}
                    className="block mx-auto mt-2 text-cyan-700 hover:underline text-xs"
                  >
                    Réinitialiser les filtres
                  </button>
                )}
              </div>
            ) : (
              filtered.map((l) => {
                const Icon = KIND_ICONS[l.kind];
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    className="w-full text-left px-4 py-3 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-slate-400 shrink-0" />
                          <p className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-cyan-700 dark:group-hover:text-cyan-400">
                            {l.name}
                          </p>
                        </div>
                        {(l.address || l.city) && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1 flex items-center gap-1 ml-6">
                            <MapPin className="h-3 w-3" />
                            {[l.address, l.postal_code, l.city]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2 ml-6 text-[11px]">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium",
                              LOCATION_KIND_BADGE_CLASSES[l.kind],
                            )}
                          >
                            {LOCATION_KIND_LABELS[l.kind]}
                          </span>
                          {l.capacity !== null && (
                            <span className="inline-flex items-center gap-1 text-slate-500">
                              <Users className="h-2.5 w-2.5" />
                              {l.capacity} pers.
                            </span>
                          )}
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium",
                              PMR_LEVEL_BADGE_CLASSES[l.pmr_accessible],
                            )}
                          >
                            <Accessibility className="h-2.5 w-2.5" />
                            {PMR_LEVEL_LABELS[l.pmr_accessible]}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400 group-hover:text-cyan-600 font-medium">
                        Choisir →
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
