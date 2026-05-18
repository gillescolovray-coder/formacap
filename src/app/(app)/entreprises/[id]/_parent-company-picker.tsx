"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setParentCompany } from "../actions";
import { cn } from "@/lib/utils";

type CompanyOption = {
  id: string;
  name: string;
  postal_code?: string | null;
  city?: string | null;
};

type Props = {
  /** ID de la société courante (la « fille » dans la relation). */
  companyId: string;
  /** Liste de toutes les autres entreprises sélectionnables comme mère.
   *  Doit déjà exclure la société elle-même côté serveur. */
  candidates: CompanyOption[];
  /** Société mère actuellement rattachée. */
  currentParent: CompanyOption | null;
};

/**
 * Picker pour rattacher une société mère à la fiche entreprise courante.
 * Soumet via la server action `setParentCompany` (validation anti-cycle
 * + auto-référence). Le dropdown est rendu via portail pour échapper à
 * l'`overflow-hidden` du CollapsibleSection parent.
 */
export function ParentCompanyPicker({
  companyId,
  candidates,
  currentParent,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Position du portail
  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Fermeture sur clic extérieur
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

  // Filtrage par recherche (nom + ville)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 50);
    return candidates
      .filter((c) =>
        [c.name, c.city ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 50);
  }, [candidates, query]);

  function submitParent(parentId: string | null) {
    const fd = new FormData();
    if (parentId) fd.append("parent_company_id", parentId);
    startTransition(async () => {
      await setParentCompany(companyId, fd);
    });
    setOpen(false);
  }

  return (
    <div className="space-y-3">
      {/* Affichage du parent actuel (si présent) */}
      {currentParent ? (
        <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 p-3 flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-violet-700 dark:text-violet-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-violet-700 dark:text-violet-400">
              Société mère
            </p>
            <Link
              href={`/entreprises/${currentParent.id}`}
              className="text-sm font-bold text-violet-900 dark:text-violet-200 hover:underline inline-flex items-center gap-1"
            >
              {currentParent.name}
              <ExternalLink className="h-3 w-3" />
            </Link>
            {(currentParent.postal_code || currentParent.city) && (
              <p className="text-[11px] text-violet-700 dark:text-violet-400">
                {[currentParent.postal_code, currentParent.city]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => submitParent(null)}
            disabled={pending}
            title="Détacher de la société mère"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            Détacher
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-500 italic">
          Aucune société mère rattachée. Sélectionnez-en une ci-dessous si
          cette entreprise est une filiale.
        </p>
      )}

      {/* Picker pour (re)rattacher une société mère */}
      <div ref={wrapRef} className="relative">
        <div
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex items-center gap-2 h-9 w-full rounded-md border bg-white dark:bg-slate-900 px-3 cursor-pointer transition-colors",
            open
              ? "border-violet-500 ring-1 ring-violet-500"
              : "border-slate-300 dark:border-slate-700 hover:border-violet-400",
          )}
        >
          <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
          <span className="text-sm flex-1 truncate text-slate-600">
            {currentParent
              ? "Changer de société mère…"
              : "Rechercher une société mère…"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-400 shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        </div>

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
                    placeholder="Tapez le nom de la société mère…"
                    className="pl-8 h-8 text-sm"
                  />
                </div>
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
                    const isCurrent = currentParent?.id === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => submitParent(c.id)}
                          disabled={pending || isCurrent}
                          className={cn(
                            "w-full text-left px-3 py-2 hover:bg-violet-50 dark:hover:bg-violet-950/30 border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm flex items-center gap-2",
                            isCurrent && "bg-violet-50 cursor-default",
                          )}
                        >
                          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="font-medium truncate">
                            {c.name}
                          </span>
                          {cpVille && (
                            <span className="text-[11px] text-slate-500 ml-auto whitespace-nowrap">
                              {cpVille}
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-[10px] font-bold text-violet-700 uppercase">
                              actuel
                            </span>
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
