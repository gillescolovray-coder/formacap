"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  GraduationCap,
  Loader2,
  Save,
  Search,
  X,
} from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setTrainerFormations } from "../actions";

type FormationOption = {
  id: string;
  title: string;
  /** presentiel / distanciel / hybride — affiché en badge devant le titre. */
  modality?: string | null;
  /** Joined `formation_categories(id, name)`. */
  category?: { id: string; name: string } | null;
};

const MODALITY_BADGE: Record<
  string,
  { label: string; classes: string }
> = {
  presentiel: {
    label: "PRÉSENTIEL",
    classes: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  distanciel: {
    label: "DISTANCIEL",
    classes: "bg-cyan-100 text-cyan-800 border-cyan-300",
  },
  hybride: {
    label: "HYBRIDE",
    classes: "bg-violet-100 text-violet-800 border-violet-300",
  },
};

type LinkedFormation = {
  formation_id: string;
  justification: string | null;
  formation: { id: string; title: string } | null;
};

type Props = {
  trainerId: string;
  allFormations: FormationOption[];
  linked: LinkedFormation[];
};

const UNCATEGORIZED_LABEL = "Sans catégorie";

/**
 * Module "Formations animables" du formateur — refonte 2026-05-23.
 *
 * UX :
 *  - Cases à cocher groupées par catégorie de formation
 *  - Recherche par titre / catégorie
 *  - 1 seule justification commune saisie au moment de l'enregistrement
 *    (s'applique aux NOUVEAUX ajouts uniquement, les anciennes
 *    justifications ne sont pas écrasées)
 *  - Décocher une formation déjà liée = retrait au submit
 *  - Confirmation si retraits avant submit
 *  - Compteur "+X / -Y" sur le bouton Enregistrer
 *
 * Couvre Qualiopi indicateur 21 (adéquation formateur ↔ formations).
 */
export function FormationsSection({
  trainerId,
  allFormations,
  linked,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // État initial : Set des formation_ids déjà liés
  const initialLinkedIds = useMemo(
    () => new Set(linked.map((l) => l.formation_id)),
    [linked],
  );
  const justificationByFormation = useMemo(
    () => new Map(linked.map((l) => [l.formation_id, l.justification])),
    [linked],
  );

  const [checked, setChecked] = useState<Set<string>>(initialLinkedIds);
  const [search, setSearch] = useState("");
  const [justification, setJustification] = useState("");

  // Diff vs état initial
  const toAdd = useMemo(
    () => Array.from(checked).filter((id) => !initialLinkedIds.has(id)),
    [checked, initialLinkedIds],
  );
  const toRemove = useMemo(
    () => Array.from(initialLinkedIds).filter((id) => !checked.has(id)),
    [checked, initialLinkedIds],
  );
  const hasChanges = toAdd.length > 0 || toRemove.length > 0;

  // Regroupement par catégorie + filtre recherche
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? allFormations.filter(
          (f) =>
            f.title.toLowerCase().includes(term) ||
            (f.category?.name ?? "").toLowerCase().includes(term),
        )
      : allFormations;

    const byCategory = new Map<string, FormationOption[]>();
    for (const f of filtered) {
      const key = f.category?.name ?? UNCATEGORIZED_LABEL;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(f);
    }
    // Tri : "Sans catégorie" en dernier, sinon alpha
    const sortedKeys = Array.from(byCategory.keys()).sort((a, b) => {
      if (a === UNCATEGORIZED_LABEL) return 1;
      if (b === UNCATEGORIZED_LABEL) return -1;
      return a.localeCompare(b, "fr");
    });
    return sortedKeys.map((k) => ({
      category: k,
      items: byCategory.get(k)!,
    }));
  }, [allFormations, search]);

  function toggle(formationId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(formationId)) next.delete(formationId);
      else next.add(formationId);
      return next;
    });
  }

  function toggleCategoryAll(items: FormationOption[]) {
    // Si toutes les formations visibles de la catégorie sont cochées → on les retire toutes
    // Sinon → on coche toutes les non-cochées
    const allChecked = items.every((f) => checked.has(f.id));
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        for (const f of items) next.delete(f.id);
      } else {
        for (const f of items) next.add(f.id);
      }
      return next;
    });
  }

  function reset() {
    setChecked(new Set(initialLinkedIds));
    setJustification("");
    setError(null);
    setInfo(null);
  }

  function save() {
    if (!hasChanges) return;
    if (toRemove.length > 0) {
      const msg =
        toRemove.length === 1
          ? "Vous allez retirer 1 formation de ce formateur. Continuer ?"
          : `Vous allez retirer ${toRemove.length} formations de ce formateur. Continuer ?`;
      if (!confirm(msg)) return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await setTrainerFormations(trainerId, {
        toAdd,
        toRemove,
        commonJustification: justification,
      });
      if (!res.ok) {
        setError(res.error ?? "Erreur");
        return;
      }
      const parts: string[] = [];
      if (res.added) parts.push(`+${res.added} ajoutée${res.added > 1 ? "s" : ""}`);
      if (res.removed)
        parts.push(`-${res.removed} retirée${res.removed > 1 ? "s" : ""}`);
      setInfo(`Modifications enregistrées (${parts.join(", ")}).`);
      setJustification("");
      router.refresh();
    });
  }

  return (
    <CollapsibleSection
      icon={GraduationCap}
      title="Formations animables"
      description="Adéquation formateur ↔ formations (Qualiopi indic. 21). Cochez/décochez puis enregistrez."
      accent="emerald"
      defaultOpen
      id="formations-animables"
    >
      <div className="space-y-4">
        {/* Compteur */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-zinc-600">
            <strong className="text-emerald-700">{checked.size}</strong>{" "}
            formation{checked.size > 1 ? "s" : ""} liée
            {checked.size > 1 ? "s" : ""} sur {allFormations.length}{" "}
            disponible{allFormations.length > 1 ? "s" : ""}
            {hasChanges && (
              <>
                {" — "}
                <span className="text-amber-700 font-semibold">
                  modifications non enregistrées
                </span>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 flex items-start gap-2">
            <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{info}</span>
          </div>
        )}

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par titre ou catégorie…"
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Liste groupée par catégorie */}
        {groups.length === 0 ? (
          <div className="rounded-lg bg-zinc-50 border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
            {search
              ? "Aucune formation ne correspond à la recherche."
              : "Aucune formation publiée dans le catalogue."}
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {groups.map((g) => {
              const visibleIds = g.items.map((f) => f.id);
              const allCheckedHere = g.items.every((f) => checked.has(f.id));
              const someCheckedHere = g.items.some((f) => checked.has(f.id));
              return (
                <div
                  key={g.category}
                  className="rounded-lg border border-zinc-200 bg-white overflow-hidden"
                >
                  {/* En-tête catégorie */}
                  <div className="px-3 py-2 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between gap-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-700 truncate">
                      {g.category}
                      <span className="ml-2 text-[10px] font-semibold text-zinc-500 normal-case">
                        ({visibleIds.filter((id) => checked.has(id)).length}/
                        {g.items.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCategoryAll(g.items)}
                      className="text-[11px] text-cyan-700 hover:underline font-semibold"
                    >
                      {allCheckedHere
                        ? "Tout décocher"
                        : someCheckedHere
                          ? "Tout cocher"
                          : "Tout cocher"}
                    </button>
                  </div>
                  {/* Items */}
                  <ul className="divide-y divide-zinc-100">
                    {g.items.map((f) => {
                      const isChecked = checked.has(f.id);
                      const wasLinked = initialLinkedIds.has(f.id);
                      const isNew = isChecked && !wasLinked;
                      const isRemoved = !isChecked && wasLinked;
                      const existingJustification = wasLinked
                        ? justificationByFormation.get(f.id)
                        : null;
                      return (
                        <li
                          key={f.id}
                          className={
                            "px-3 py-2 flex items-start gap-2.5 hover:bg-zinc-50 " +
                            (isNew
                              ? "bg-emerald-50/40"
                              : isRemoved
                                ? "bg-rose-50/40"
                                : "")
                          }
                        >
                          <input
                            type="checkbox"
                            id={`f-${f.id}`}
                            checked={isChecked}
                            onChange={() => toggle(f.id)}
                            className="h-4 w-4 mt-0.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                          />
                          <label
                            htmlFor={`f-${f.id}`}
                            className="flex-1 min-w-0 cursor-pointer"
                          >
                            {f.modality && MODALITY_BADGE[f.modality] && (
                              <span
                                className={
                                  "inline-block mr-1.5 text-[9px] font-bold border px-1.5 py-0.5 rounded uppercase tracking-wider align-middle " +
                                  MODALITY_BADGE[f.modality].classes
                                }
                              >
                                {MODALITY_BADGE[f.modality].label}
                              </span>
                            )}
                            <span className="text-sm font-medium text-zinc-800 break-words">
                              {f.title}
                            </span>
                            {isNew && (
                              <span className="ml-1.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-full uppercase">
                                +Nouveau
                              </span>
                            )}
                            {isRemoved && (
                              <span className="ml-1.5 text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 px-1.5 py-0.5 rounded-full uppercase">
                                À retirer
                              </span>
                            )}
                            {existingJustification && wasLinked && !isRemoved && (
                              <span className="block text-[11px] text-zinc-500 mt-0.5 truncate italic">
                                💬 {existingJustification}
                              </span>
                            )}
                          </label>
                          <Link
                            href={`/formations/${f.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-cyan-700 hover:underline shrink-0"
                            title="Voir la fiche formation"
                          >
                            Fiche →
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {/* Justification commune (s'affiche si au moins un ajout) */}
        {toAdd.length > 0 && (
          <div className="rounded-lg bg-emerald-50/50 border-2 border-emerald-200 p-3 space-y-2">
            <Label
              htmlFor="commonJustification"
              className="text-xs font-bold text-emerald-900"
            >
              Justification de la compétence ({toAdd.length} nouvelle
              {toAdd.length > 1 ? "s" : ""} formation{toAdd.length > 1 ? "s" : ""})
            </Label>
            <Textarea
              id="commonJustification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={2}
              placeholder="Pourquoi ce formateur est-il compétent pour ces formations ? (texte commun appliqué aux nouvelles formations cochées)"
              className="bg-white"
            />
            <p className="text-[11px] text-emerald-700/80 italic">
              Cette justification sera enregistrée pour les nouvelles
              formations cochées. Les justifications existantes ne sont
              pas modifiées.
            </p>
          </div>
        )}

        {/* Barre d'enregistrement */}
        {hasChanges && (
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={pending}
            >
              Annuler les modifications
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={pending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Enregistrer
              {toAdd.length > 0 && ` (+${toAdd.length}`}
              {toRemove.length > 0 && `${toAdd.length > 0 ? " / " : " ("}-${toRemove.length}`}
              {(toAdd.length > 0 || toRemove.length > 0) && ")"}
            </Button>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
