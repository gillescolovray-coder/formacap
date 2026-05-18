"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mail, Phone, Smartphone, UserCog, X } from "lucide-react";

type Trainer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
};

/**
 * Affiche le nom du formateur dans l'en-tête d'une session ; au clic,
 * ouvre un popover (rendu via portal pour échapper aux overflows
 * parents) avec ses coordonnées (tél, mobile, email).
 */
export function TrainerPopover({ trainer }: { trainer: Trainer }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const fullName = `${trainer.first_name} ${trainer.last_name}`.trim();

  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left });
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
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 hover:border-amber-400 transition-colors"
        title="Voir les coordonnées du formateur"
      >
        <UserCog className="h-3 w-3" />
        {fullName}
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
            className="w-72 rounded-lg border border-amber-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 rounded-t-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-amber-700" />
                <p className="font-bold text-sm text-amber-900">{fullName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-amber-700 hover:text-red-600"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="p-3 space-y-2 text-sm">
              {trainer.phone ? (
                <li>
                  <a
                    href={`tel:${trainer.phone}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-cyan-50 group"
                  >
                    <Phone className="h-4 w-4 text-slate-400 group-hover:text-cyan-700" />
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 w-14">
                      Tél
                    </span>
                    <span className="font-bold tabular-nums group-hover:text-cyan-700">
                      {trainer.phone}
                    </span>
                  </a>
                </li>
              ) : null}
              {trainer.mobile ? (
                <li>
                  <a
                    href={`tel:${trainer.mobile}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-cyan-50 group"
                  >
                    <Smartphone className="h-4 w-4 text-slate-400 group-hover:text-cyan-700" />
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 w-14">
                      Mobile
                    </span>
                    <span className="font-bold tabular-nums group-hover:text-cyan-700">
                      {trainer.mobile}
                    </span>
                  </a>
                </li>
              ) : null}
              {trainer.email ? (
                <li>
                  <a
                    href={`mailto:${trainer.email}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-cyan-50 group"
                  >
                    <Mail className="h-4 w-4 text-slate-400 group-hover:text-cyan-700" />
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 w-14">
                      Email
                    </span>
                    <span className="font-medium text-slate-700 group-hover:text-cyan-700 truncate">
                      {trainer.email}
                    </span>
                  </a>
                </li>
              ) : null}
              {!trainer.phone && !trainer.mobile && !trainer.email && (
                <li className="px-2 py-1.5 text-xs text-slate-400 italic">
                  Aucune coordonnée renseignée pour ce formateur.
                </li>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
