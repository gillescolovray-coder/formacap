"use client";

import { History, Loader2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { changeStageFromForm } from "./actions";
import { cn } from "@/lib/utils";

type Stage = {
  id: string;
  name: string;
  color: string | null;
  position: number;
};

type StageEvent = {
  request_id: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
};

type Props = {
  inscriptionId: string;
  currentStageId: string | null;
  stages: Stage[];
  /** Historique trié décroissant (plus récent en tête). */
  history?: StageEvent[];
};

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Sélecteur d'étape inline + bouton d'historique.
 *
 * Le sélecteur change l'étape côté serveur sans naviguer ni rediriger
 * (l'utilisateur reste dans la liste). Le bouton « historique » ouvre
 * un popover avec la timeline complète des changements d'étape de
 * l'inscription.
 */
export function StageQuickChanger({
  inscriptionId,
  currentStageId,
  stages,
  history = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const action = changeStageFromForm.bind(null, inscriptionId);

  const stageById = new Map(stages.map((s) => [s.id, s]));
  const currentStage = currentStageId ? stageById.get(currentStageId) : null;

  // Positionnement du popover — recalculé au scroll/resize.
  // Si le popover (320px) déborde à droite de l'écran, on l'aligne sur
  // le bord droit du déclencheur au lieu du bord gauche.
  useEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const popWidth = 320; // doit correspondre au w-80 du panneau
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

  // Fermeture sur clic extérieur ou ESC
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

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStageId = e.target.value;
    if (!newStageId || newStageId === currentStageId) return;
    const formData = new FormData();
    formData.set("stage_id", newStageId);
    startTransition(() => {
      action(formData);
    });
  }

  // Date d'entrée dans l'étape courante : le 1er event "stage_changed"
  // dont la cible est le stage actuel.
  const lastChange = history.find(
    (e) => e.to_stage_id === currentStageId,
  );

  return (
    <div className="flex items-center gap-1 w-full min-w-0">
      <select
        value={currentStageId ?? ""}
        onChange={handleChange}
        disabled={isPending}
        onClick={(e) => e.stopPropagation()}
        title={
          lastChange
            ? `Étape : ${currentStage?.name ?? "—"}\nDepuis le ${DATE_FMT.format(new Date(lastChange.created_at))}`
            : "Cliquez pour changer l'étape"
        }
        className={cn(
          "h-7 rounded text-[10px] font-bold border-2 px-1.5 pr-1.5 cursor-pointer appearance-none transition-all flex-1 min-w-0 truncate",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400",
          isPending && "opacity-50 cursor-wait",
        )}
        style={{
          backgroundColor: currentStage
            ? `${currentStage.color}15`
            : "#f1f5f9",
          borderColor: currentStage?.color ?? "#94a3b8",
          color: currentStage?.color ?? "#475569",
        }}
      >
        <option value="" disabled>
          —
        </option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {isPending && (
        <Loader2
          className="h-3 w-3 animate-spin shrink-0"
          style={{ color: currentStage?.color ?? "#475569" }}
        />
      )}

      {/* Bouton d'historique — petit, fixé à 20px, ne déborde pas */}
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        title="Voir l'historique des changements d'étape"
        aria-label="Historique des étapes"
        className={cn(
          "h-5 w-5 inline-flex items-center justify-center rounded-full border transition-colors shrink-0",
          history.length > 0
            ? "border-slate-300 bg-white text-slate-600 hover:border-cyan-400 hover:text-cyan-700 hover:bg-cyan-50"
            : "border-slate-200 bg-slate-50 text-slate-300 cursor-default",
        )}
        disabled={history.length === 0}
      >
        <History className="h-2.5 w-2.5" />
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
            className="w-80 rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-cyan-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
                  <History className="h-3.5 w-3.5 text-cyan-700" />
                </div>
                <p className="font-bold text-sm text-slate-800">
                  Historique des étapes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-red-600 text-xs"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {history.length === 0 && (
                <li className="px-4 py-3 text-xs text-slate-400 italic">
                  Aucun changement d&apos;étape enregistré.
                </li>
              )}
              {history.map((e, i) => {
                const from = e.from_stage_id
                  ? stageById.get(e.from_stage_id)
                  : null;
                const to = e.to_stage_id
                  ? stageById.get(e.to_stage_id)
                  : null;
                const comment =
                  (e.payload as { comment?: string | null } | null)?.comment ??
                  null;
                return (
                  <li
                    key={i}
                    className="px-4 py-2.5 border-b border-slate-100 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                        {DATE_FMT.format(new Date(e.created_at))}
                      </p>
                      {e.actor_name && (
                        <p
                          className="text-[10px] font-semibold text-cyan-700 truncate max-w-[55%]"
                          title={`Action effectuée par ${e.actor_name}`}
                        >
                          par {e.actor_name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      {from ? (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded font-bold border"
                          style={{
                            backgroundColor: `${from.color}15`,
                            borderColor: from.color ?? "#94a3b8",
                            color: from.color ?? "#475569",
                          }}
                        >
                          {from.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">
                          Création
                        </span>
                      )}
                      <span className="text-slate-400">→</span>
                      {to && (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded font-bold border"
                          style={{
                            backgroundColor: `${to.color}15`,
                            borderColor: to.color ?? "#94a3b8",
                            color: to.color ?? "#475569",
                          }}
                        >
                          {to.name}
                        </span>
                      )}
                    </div>
                    {comment && (
                      <p className="text-[11px] text-slate-600 italic mt-1">
                        « {comment} »
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
