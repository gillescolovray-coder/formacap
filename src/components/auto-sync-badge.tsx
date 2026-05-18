"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";

type Rule = {
  /** Champ source (ex: "Téléphone"). */
  field: string;
  /** Module/fiche cible (ex: "Fiche apprenant"). */
  target: string;
  /** Condition (ex: "si vide sur la fiche cible"). */
  condition?: string;
};

type Props = {
  /** Titre du panneau (ex: "Synchronisation automatique"). */
  title?: string;
  /** Liste des règles de synchronisation actives. */
  rules: Rule[];
  /** Note de bas de panneau optionnelle (avertissement, exception…). */
  footnote?: React.ReactNode;
};

/**
 * Badge visible « 🔄 Auto-synchro » à placer dans l'en-tête d'une
 * section où des comportements automatiques sont actifs (ex: bloc
 * Demandeur d'une inscription qui synchronise le téléphone vers la
 * fiche apprenant).
 *
 * Au clic, ouvre un panneau listant clairement chaque règle :
 *   « Téléphone → Fiche apprenant — si vide »
 *   « Email     → Fiche apprenant — si vide »
 *   …
 *
 * Objectif : transparence sur les automatismes pour l'utilisateur.
 */
export function AutoSyncBadge({
  title = "Synchronisation automatique",
  rules,
  footnote,
}: Props) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const popWidth = 360;
      const margin = 8;
      let left = r.left;
      if (left + popWidth > window.innerWidth - margin) {
        left = Math.max(margin, r.right - popWidth);
      }
      setRect({ top: r.bottom + 4, left });
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
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={`${title} — cliquer pour voir les règles`}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors cursor-help"
      >
        <RefreshCw className="h-3 w-3" />
        Auto-synchro · {rules.length} règle{rules.length > 1 ? "s" : ""}
      </button>

      {open &&
        rect &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              zIndex: 9999,
            }}
            className="w-[360px] rounded-xl border border-emerald-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-cyan-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
                  <RefreshCw className="h-3.5 w-3.5 text-emerald-700" />
                </div>
                <p className="font-bold text-sm text-slate-800">{title}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-red-600"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="divide-y divide-slate-100">
              {rules.map((r, i) => (
                <li key={i} className="px-4 py-2.5 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800 border border-cyan-200 font-bold">
                      {r.field}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="inline-block px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200 font-bold">
                      {r.target}
                    </span>
                  </div>
                  {r.condition && (
                    <p className="text-[11px] text-slate-500 mt-1 italic">
                      {r.condition}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {footnote && (
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-600">
                {footnote}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
