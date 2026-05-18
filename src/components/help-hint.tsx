"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Texte court (1-2 phrases) — affiché en tooltip natif au survol. */
  text: string;
  /** Contenu détaillé optionnel — affiché dans un popover au clic.
   *  Utile pour expliquer des règles plus longues. */
  details?: React.ReactNode;
  /** Variante visuelle. */
  tone?: "info" | "auto";
  className?: string;
};

const TONE_CLASSES: Record<NonNullable<Props["tone"]>, string> = {
  info: "text-cyan-600 hover:text-cyan-800 hover:bg-cyan-50",
  auto: "text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50",
};

/**
 * Petit indicateur d'aide à placer à côté d'un libellé de champ ou d'un
 * bouton d'action pour expliquer une règle métier non évidente
 * (synchronisation automatique, validation conditionnelle, etc.).
 *
 * Usage type :
 *   <Label>Téléphone <HelpHint text="Sera reporté sur la fiche apprenant si elle ne contient pas encore de numéro." /></Label>
 */
export function HelpHint({ text, details, tone = "info", className }: Props) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Position du popover (recalculée au scroll/resize)
  useEffect(() => {
    if (!open || !details) return;
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const popWidth = 320;
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
  }, [open, details]);

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
          if (!details) return;
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={text}
        aria-label={text}
        className={cn(
          "inline-flex items-center justify-center h-4 w-4 rounded-full transition-colors",
          TONE_CLASSES[tone],
          details && "cursor-help",
          !details && "cursor-default",
          className,
        )}
      >
        <Info className="h-3 w-3" />
      </button>

      {open &&
        details &&
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
            className="w-80 rounded-xl border border-cyan-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 border-b border-cyan-100 bg-cyan-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-cyan-700" />
                <p className="text-[11px] uppercase tracking-wider font-bold text-cyan-800">
                  Bon à savoir
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-red-600"
                aria-label="Fermer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="p-4 text-xs text-slate-700 leading-relaxed space-y-2">
              <p className="font-medium text-slate-900">{text}</p>
              <div className="text-slate-600">{details}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
