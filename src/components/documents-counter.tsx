"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText } from "lucide-react";

export type DocumentCounterItem = {
  kind: string;          // identifiant interne
  kindLabel: string;     // libellé affiché
  fileName: string;
  label?: string | null;
  expiresOn?: string | null;
};

type Props = {
  documents: DocumentCounterItem[];
  /** Seuil en jours pour considérer un doc "qui expire bientôt" (défaut : 90). */
  warningDaysBefore?: number;
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("fr-FR");
}

export function DocumentsCounter({
  documents,
  warningDaysBefore = 90,
}: Props) {
  const total = documents.length;
  const today = new Date();
  const badgeRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Tri : expirés en haut, puis bientôt expirés, puis valides, puis sans date
  const sorted = [...documents].sort((a, b) => {
    const aExp = a.expiresOn ? new Date(a.expiresOn) : null;
    const bExp = b.expiresOn ? new Date(b.expiresOn) : null;
    const aOver = aExp ? aExp < today : false;
    const bOver = bExp ? bExp < today : false;
    if (aOver !== bOver) return aOver ? -1 : 1;
    if (aExp && bExp) return aExp.getTime() - bExp.getTime();
    if (aExp) return -1;
    if (bExp) return 1;
    return 0;
  });

  const expiredCount = documents.filter(
    (d) => d.expiresOn && new Date(d.expiresOn) < today,
  ).length;

  function showTooltip() {
    if (!badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
    setOpen(true);
  }

  function hideTooltip() {
    setOpen(false);
  }

  return (
    <>
      <span
        ref={badgeRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onClick={(e) => e.stopPropagation()}
        className={
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold cursor-help select-none border " +
          (expiredCount > 0
            ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
            : total > 0
              ? "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900"
              : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700")
        }
      >
        <FileText className="h-3.5 w-3.5" />
        {total}
        {expiredCount > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider">
            · {expiredCount} expiré{expiredCount > 1 ? "s" : ""}
          </span>
        )}
      </span>

      {mounted &&
        open &&
        coords &&
        total > 0 &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: coords.top,
              right: coords.right,
              zIndex: 9999,
            }}
            className={
              "w-80 max-h-96 overflow-y-auto " +
              "rounded-xl bg-white dark:bg-slate-900 " +
              "border border-slate-200 dark:border-slate-700 " +
              "shadow-2xl"
            }
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
          >
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-xl">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {total} document{total > 1 ? "s" : ""}
                {expiredCount > 0 && (
                  <span className="text-red-600 dark:text-red-400 ml-1">
                    · {expiredCount} expiré{expiredCount > 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {sorted.map((d, i) => {
                const exp = d.expiresOn ? new Date(d.expiresOn) : null;
                const expired = exp ? exp < today : false;
                const soon =
                  exp &&
                  !expired &&
                  exp.getTime() - today.getTime() <
                    warningDaysBefore * 24 * 3600 * 1000;
                return (
                  <li
                    key={`${d.fileName}-${i}`}
                    className="px-4 py-2.5 flex items-start justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                        {d.kindLabel}
                      </p>
                      <p className="text-xs font-medium truncate">
                        {d.label || d.fileName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {d.expiresOn ? (
                        <span
                          className={
                            "inline-block px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap " +
                            (expired
                              ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                              : soon
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                : "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300")
                          }
                        >
                          {expired ? "Expiré le " : "Expire le "}
                          {formatDate(d.expiresOn)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          Sans expiration
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
