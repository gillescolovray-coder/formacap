"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock,
  Hash,
  Layers,
  Search,
  Tag,
  Video,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MODALITY_BADGE_CLASSES,
  MODALITY_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  categoryColor,
  type Formation,
  type FormationModality,
} from "@/lib/formations/types";

const MODALITY_ICONS: Record<FormationModality, typeof Building2> = {
  presentiel: Building2,
  distanciel: Video,
  hybride: Layers,
};

type Props = {
  formations: Formation[];
  defaultValue?: string;
};

export function FormationPicker({ formations, defaultValue }: Props) {
  const [selectedId, setSelectedId] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const [modalityFilter, setModalityFilter] = useState<
    FormationModality | ""
  >("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  // Catégories distinctes présentes dans le catalogue
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of formations) {
      if (f.category?.id && f.category.name) {
        map.set(f.category.id, f.category.name);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [formations]);

  // Liste filtrée
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return formations.filter((f) => {
      if (modalityFilter && f.modality !== modalityFilter) return false;
      if (categoryFilter && f.category?.id !== categoryFilter) return false;
      if (q) {
        const text = [
          f.title,
          f.internal_code ?? "",
          f.subtitle ?? "",
          f.category?.name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [formations, query, modalityFilter, categoryFilter]);

  const selectedFormation = formations.find((f) => f.id === selectedId);

  /**
   * Sélectionne une formation et notifie la PlanningSection (via un
   * événement DOM custom) de la durée en jours, pour qu'elle puisse
   * pré-remplir la date de fin automatiquement.
   */
  function pickFormation(f: Formation) {
    setSelectedId(f.id);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("session:formation-picked", {
          detail: {
            id: f.id,
            duration_days: f.duration_days ?? null,
            title: f.title,
          },
        }),
      );
    }
  }

  const isFiltered =
    Boolean(query) || Boolean(modalityFilter) || Boolean(categoryFilter);

  return (
    <div className="space-y-3">
      {/* Champ caché pour soumission du form */}
      <input type="hidden" name="formation_id" value={selectedId} required />

      {/* Formation sélectionnée */}
      {selectedFormation && (
        <div className="rounded-xl border-2 border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-cyan-700 dark:text-cyan-400 mb-0.5">
              Formation sélectionnée
            </p>
            <p className="text-base font-bold tracking-tight">
              {selectedFormation.title}
            </p>
            {selectedFormation.subtitle && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                {selectedFormation.subtitle}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
              {selectedFormation.internal_code && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                  <Hash className="h-3 w-3" />
                  {selectedFormation.internal_code}
                </span>
              )}
              {selectedFormation.category?.name &&
                (() => {
                  const c = categoryColor(selectedFormation.category.name);
                  return (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border",
                        c.bg,
                        c.text,
                        c.border,
                      )}
                    >
                      <Tag className="h-3 w-3" />
                      {selectedFormation.category.name}
                    </span>
                  );
                })()}
              {selectedFormation.modality &&
                (() => {
                  const Icon = MODALITY_ICONS[selectedFormation.modality];
                  return (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium",
                        MODALITY_BADGE_CLASSES[selectedFormation.modality],
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {MODALITY_LABELS[selectedFormation.modality]}
                    </span>
                  );
                })()}
              {selectedFormation.duration_hours && (
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  <Clock className="h-3 w-3" />
                  {selectedFormation.duration_hours} h
                  {selectedFormation.duration_days
                    ? ` · ${selectedFormation.duration_days} j`
                    : ""}
                </span>
              )}
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
      )}

      {/* Sélecteur (visible si rien n'est sélectionné OU pour changer) */}
      {!selectedFormation && (
        <div className="space-y-3">
          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              type="search"
              placeholder="Rechercher par titre, code, sous-titre, catégorie…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filtres modalité */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mr-1">
              Modalité :
            </span>
            <button
              type="button"
              onClick={() => setModalityFilter("")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                modalityFilter === ""
                  ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900"
                  : "bg-white dark:bg-slate-900 text-slate-600 border-slate-300 dark:border-slate-700 hover:border-slate-500",
              )}
            >
              Toutes
            </button>
            {(
              Object.keys(MODALITY_LABELS) as FormationModality[]
            ).map((m) => {
              const Icon = MODALITY_ICONS[m];
              const isActive = modalityFilter === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModalityFilter(isActive ? "" : m)}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                    isActive
                      ? MODALITY_BADGE_CLASSES[m] +
                          " ring-2 ring-offset-1 ring-slate-900 dark:ring-white"
                      : "bg-white dark:bg-slate-900 text-slate-600 border-slate-300 dark:border-slate-700 hover:border-slate-500",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {MODALITY_LABELS[m]}
                </button>
              );
            })}
          </div>

          {/* Filtres catégorie */}
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mr-1">
                Catégorie :
              </span>
              <button
                type="button"
                onClick={() => setCategoryFilter("")}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  categoryFilter === ""
                    ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900"
                    : "bg-white dark:bg-slate-900 text-slate-600 border-slate-300 dark:border-slate-700 hover:border-slate-500",
                )}
              >
                Toutes
              </button>
              {categories.map((c) => {
                const cc = categoryColor(c.name);
                const isActive = categoryFilter === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryFilter(isActive ? "" : c.id)}
                    className={cn(
                      "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                      isActive
                        ? cn(
                            cc.bg,
                            cc.text,
                            cc.border,
                            "ring-2 ring-offset-1 ring-slate-900 dark:ring-white",
                          )
                        : "bg-white dark:bg-slate-900 text-slate-600 border-slate-300 dark:border-slate-700 hover:border-slate-500",
                    )}
                  >
                    <Tag className="h-3 w-3" />
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Compteur */}
          <p className="text-xs text-slate-500">
            {filtered.length} formation{filtered.length > 1 ? "s" : ""}
            {isFiltered ? " correspondante" + (filtered.length > 1 ? "s" : "") : ""}
            {formations.length !== filtered.length &&
              ` sur ${formations.length}`}
          </p>

          {/* Cartes des formations */}
          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/50">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Aucune formation ne correspond.
                {isFiltered && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setModalityFilter("");
                      setCategoryFilter("");
                    }}
                    className="block mx-auto mt-2 text-cyan-700 hover:underline text-xs"
                  >
                    Réinitialiser les filtres
                  </button>
                )}
              </div>
            ) : (
              filtered.map((f) => {
                const cc = categoryColor(f.category?.name);
                const ModalityIcon = f.modality
                  ? MODALITY_ICONS[f.modality]
                  : null;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => pickFormation(f)}
                    className="w-full text-left px-4 py-3 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-cyan-700 dark:group-hover:text-cyan-400">
                          {f.title}
                        </p>
                        {f.subtitle && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                            {f.subtitle}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px]">
                          <span
                            className={cn(
                              "inline-block px-1.5 py-0.5 rounded font-medium",
                              STATUS_BADGE_CLASSES[f.status],
                            )}
                          >
                            {STATUS_LABELS[f.status]}
                          </span>
                          {f.internal_code && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                              <Hash className="h-2.5 w-2.5" />
                              {f.internal_code}
                            </span>
                          )}
                          {f.category?.name && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium border",
                                cc.bg,
                                cc.text,
                                cc.border,
                              )}
                            >
                              <Tag className="h-2.5 w-2.5" />
                              {f.category.name}
                            </span>
                          )}
                          {f.modality && ModalityIcon && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium",
                                MODALITY_BADGE_CLASSES[f.modality],
                              )}
                            >
                              <ModalityIcon className="h-2.5 w-2.5" />
                              {MODALITY_LABELS[f.modality]}
                            </span>
                          )}
                          {f.duration_hours && (
                            <span className="inline-flex items-center gap-1 text-slate-500">
                              <Clock className="h-2.5 w-2.5" />
                              {f.duration_hours} h
                              {f.duration_days
                                ? ` · ${f.duration_days} j`
                                : ""}
                            </span>
                          )}
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
