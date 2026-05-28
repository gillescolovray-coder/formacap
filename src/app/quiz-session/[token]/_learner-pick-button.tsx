"use client";

import { CheckCircle2, Circle, GraduationCap, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

type Props = {
  fullName: string;
  preDone: boolean;
  postDone: boolean;
  allDone: boolean;
};

/**
 * Bouton client pour la selection d'un apprenant dans la liste publique
 * /quiz-session/[token]. Utilise useFormStatus pour afficher un spinner
 * + texte "Chargement..." immediatement au clic, le temps que la server
 * action s'execute (lookup token + redirect vers /mon-parcours).
 *
 * Gilles 2026-05-27 retour terrain : sans feedback visuel, l'apprenant
 * recliquait pensant que rien ne se passait.
 */
export function LearnerPickButton({
  fullName,
  preDone,
  postDone,
  allDone,
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={allDone || pending}
      className={
        "w-full text-left rounded-xl border-2 p-4 flex items-center justify-between gap-3 transition " +
        (allDone
          ? "bg-emerald-50 border-emerald-200 text-emerald-800 cursor-default"
          : pending
            ? "bg-amber-100 border-amber-500 text-amber-900 cursor-wait"
            : "bg-white border-zinc-200 hover:border-amber-400 hover:bg-amber-50 active:bg-amber-100 cursor-pointer")
      }
    >
      <div className="flex items-center gap-3 min-w-0">
        {pending ? (
          <Loader2 className="h-5 w-5 shrink-0 text-amber-700 animate-spin" />
        ) : (
          <GraduationCap
            className={
              "h-5 w-5 shrink-0 " +
              (allDone ? "text-emerald-600" : "text-amber-600")
            }
          />
        )}
        <div className="min-w-0">
          <div className="font-semibold text-zinc-900 truncate">
            {fullName || "Apprenant"}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="inline-flex items-center gap-1">
              {preDone ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              ) : (
                <Circle className="h-3 w-3 text-zinc-300" />
              )}
              <span className={preDone ? "text-emerald-700" : "text-zinc-500"}>
                Entrée
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              {postDone ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              ) : (
                <Circle className="h-3 w-3 text-zinc-300" />
              )}
              <span className={postDone ? "text-emerald-700" : "text-zinc-500"}>
                Sortie
              </span>
            </span>
          </div>
        </div>
      </div>
      {pending ? (
        <span className="text-xs font-bold text-amber-800 shrink-0">
          Chargement…
        </span>
      ) : allDone ? (
        <span className="text-[11px] font-medium text-emerald-700 shrink-0">
          Terminé
        </span>
      ) : (
        <span className="text-xs font-bold text-amber-700 shrink-0">
          C&apos;est moi →
        </span>
      )}
    </button>
  );
}
