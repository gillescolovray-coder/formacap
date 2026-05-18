"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setParentCompany } from "../actions";
import { cn } from "@/lib/utils";

type SubsidiaryRow = {
  id: string;
  name: string;
  postal_code: string | null;
  city: string | null;
  type: string | null;
};

type Candidate = {
  id: string;
  name: string;
  postal_code: string | null;
  city: string | null;
  /** Si déjà rattachée à une autre société : nom de l'actuel parent
   *  (ne sera pas écrasé sans confirmation explicite). */
  current_parent_name: string | null;
};

type Props = {
  /** Société courante = future société mère. */
  parentCompanyId: string;
  /** Filiales déjà rattachées à cette société. */
  subsidiaries: SubsidiaryRow[];
  /** Toutes les autres entreprises sélectionnables comme filiales
   *  (exclut la société courante elle-même). */
  candidates: Candidate[];
};

/**
 * Gestionnaire des filiales d'une société mère :
 * - Affiche la liste des filiales actuelles avec lien et bouton « Détacher »
 * - Bouton « + Ajouter une filiale » qui ouvre un picker (recherche)
 * - Quand l'utilisateur pick une filiale : la `setParentCompany` est
 *   appelée avec la société COURANTE comme nouveau parent. Si la
 *   filiale candidate avait déjà un autre parent, on demande
 *   confirmation pour écraser.
 *
 * Validation côté serveur : auto-référence et boucles sont refusées
 * (cf. setParentCompany). Le composant fait office de UI uniquement.
 */
export function SubsidiariesManager({
  parentCompanyId,
  subsidiaries,
  candidates,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const popWidth = Math.max(r.width, 360);
      const margin = 8;
      let left = r.left;
      if (left + popWidth > window.innerWidth - margin) {
        left = Math.max(margin, r.right - popWidth);
      }
      setRect({ top: r.bottom + 4, left, width: popWidth });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Liste filtrée par texte. Les sociétés déjà rattachées (à cette
  // mère) sont exclues. Celles rattachées à une autre mère sont
  // proposées avec mention.
  const subsidiaryIds = useMemo(
    () => new Set(subsidiaries.map((s) => s.id)),
    [subsidiaries],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates
      .filter((c) => !subsidiaryIds.has(c.id))
      .filter((c) =>
        q
          ? [c.name, c.city ?? "", c.postal_code ?? ""]
              .join(" ")
              .toLowerCase()
              .includes(q)
          : true,
      )
      .slice(0, 60);
  }, [candidates, query, subsidiaryIds]);

  /**
   * Rattache la filiale (childId) à la société courante (parent).
   * Si la filiale a déjà un autre parent, demande confirmation.
   */
  function attachSubsidiary(childId: string, currentParentName: string | null) {
    if (currentParentName) {
      const ok = confirm(
        `Cette société est déjà rattachée à « ${currentParentName} ».\n\nVoulez-vous la déplacer comme filiale de la société courante ?`,
      );
      if (!ok) return;
    }
    const fd = new FormData();
    fd.append("parent_company_id", parentCompanyId);
    startTransition(async () => {
      await setParentCompany(childId, fd);
    });
    setOpen(false);
    setQuery("");
  }

  /** Détache une filiale : elle redevient autonome (parent = null). */
  function detachSubsidiary(childId: string, childName: string) {
    if (
      !confirm(
        `Détacher « ${childName} » de cette société mère ?\nLa fiche de la filiale sera conservée mais elle redeviendra autonome.`,
      )
    )
      return;
    const fd = new FormData();
    // parent_company_id absent → null côté serveur
    startTransition(async () => {
      await setParentCompany(childId, fd);
    });
  }

  return (
    <div className="space-y-3" ref={wrapRef}>
      {/* Liste des filiales actuelles */}
      {subsidiaries.length === 0 ? (
        <p className="text-xs text-slate-400 italic">
          Aucune filiale. Cette société n&apos;est mère d&apos;aucune autre
          entreprise enregistrée.
        </p>
      ) : (
        <ul className="rounded-lg border border-violet-200 dark:border-violet-900 divide-y divide-violet-100 dark:divide-violet-900/50 overflow-hidden bg-white dark:bg-slate-900">
          {subsidiaries.map((s) => {
            const cpVille = [s.postal_code, s.city]
              .filter(Boolean)
              .join(" ");
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-violet-50/50 dark:hover:bg-violet-950/30 transition-colors"
              >
                <Building2 className="h-4 w-4 text-violet-600 shrink-0" />
                <Link
                  href={`/entreprises/${s.id}`}
                  className="flex-1 min-w-0 inline-flex items-center gap-1 hover:underline"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {s.name}
                  </span>
                  <ExternalLink className="h-3 w-3 text-slate-400 shrink-0" />
                </Link>
                {cpVille && (
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">
                    {cpVille}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => detachSubsidiary(s.id, s.name)}
                  disabled={pending}
                  title="Détacher cette filiale (elle redevient autonome)"
                  aria-label="Détacher cette filiale"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Bouton + picker pour ajouter une filiale */}
      <div className="relative">
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          disabled={pending}
          className="w-full justify-between"
        >
          <span className="inline-flex items-center gap-2">
            <Plus className="h-3.5 w-3.5" />
            Ajouter une filiale…
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-400 transition-transform",
              open && "rotate-180",
            )}
          />
        </Button>

        {open &&
          rect &&
          typeof window !== "undefined" &&
          createPortal(
            <div
              style={{
                position: "fixed",
                top: rect.top,
                left: rect.left,
                width: rect.width,
                zIndex: 9999,
              }}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="px-2 py-2 border-b border-slate-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Tapez le nom de la filiale à rattacher…"
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 px-1">
                  {filtered.length} société
                  {filtered.length > 1 ? "s" : ""} disponible
                  {filtered.length > 1 ? "s" : ""}.
                </p>
              </div>
              <ul className="max-h-72 overflow-y-auto">
                {filtered.length === 0 ? (
                  <li className="px-3 py-3 text-xs text-slate-400 italic text-center">
                    Aucune entreprise trouvée.
                  </li>
                ) : (
                  filtered.map((c) => {
                    const cpVille = [c.postal_code, c.city]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() =>
                            attachSubsidiary(c.id, c.current_parent_name)
                          }
                          disabled={pending}
                          className="w-full text-left px-3 py-2 hover:bg-violet-50 dark:hover:bg-violet-950/30 border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium truncate">
                              {c.name}
                            </span>
                            {cpVille && (
                              <span className="text-[11px] text-slate-500 ml-auto whitespace-nowrap">
                                {cpVille}
                              </span>
                            )}
                          </div>
                          {c.current_parent_name && (
                            <p className="text-[10px] text-amber-700 mt-0.5 italic">
                              ⚠ Déjà rattachée à « {c.current_parent_name} » —
                              sera déplacée
                            </p>
                          )}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
