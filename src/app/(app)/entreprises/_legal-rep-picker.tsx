"use client";

import { useState, useTransition } from "react";
import { UserCheck, X } from "lucide-react";
import { listLearnersOfCompany } from "./actions";

type Learner = {
  id: string;
  civility: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
};

type Props = {
  companyId: string;
  fieldPrefix?: string;
};

/**
 * Picker "Reprendre les infos d'un apprenant" pour le bloc
 * Representant legal de la fiche entreprise (Gilles 2026-05-28).
 *
 * Cas d'usage : un gerant de TPE qui fait sa propre formation est
 * a la fois apprenant ET representant legal. Plutot que de retaper,
 * l'utilisateur clique sur le bouton, choisit l'apprenant et les
 * 4 champs se preremplissent automatiquement.
 *
 * Mise a jour des champs via DOM (les inputs sont uncontrolled
 * defaultValue). Ne deplie une liste que si companyId est connue
 * (sinon le bouton est invisible).
 */
export function LegalRepLearnerPicker({
  companyId,
  fieldPrefix = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [learners, setLearners] = useState<Learner[] | null>(null);
  const [pending, startTransition] = useTransition();

  function openPicker() {
    setOpen(true);
    if (learners !== null) return;
    startTransition(async () => {
      const list = await listLearnersOfCompany(companyId);
      setLearners(list);
    });
  }

  function pick(l: Learner) {
    // Mise a jour DOM directe (les inputs sont uncontrolled).
    // Pattern Gilles : on ecrit dans .value puis on dispatche un
    // event input pour reveiller d'eventuels listeners (au cas ou on
    // passerait un jour en controlled).
    const setField = (name: string, value: string) => {
      const el = document.getElementById(
        `${fieldPrefix}${name}`,
      ) as HTMLInputElement | null;
      if (!el) return;
      const proto = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      if (proto) proto.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setField("representant_civility", l.civility ?? "");
    setField("representant_first_name", l.first_name ?? "");
    setField("representant_last_name", l.last_name ?? "");
    // Fonction : on laisse vide par defaut pour que l'utilisateur
    // saisisse le bon titre (Gerant, PDG...) au lieu de copier la
    // fonction operationnelle de l'apprenant ("Comptable", etc.).
    // S'il n'y a vraiment rien, on suggere "Gerant".
    setField(
      "representant_job_title",
      l.job_title && l.job_title.trim().length > 0 ? l.job_title : "Gérant",
    );
    setOpen(false);
  }

  if (!companyId) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm"
      >
        <UserCheck className="h-3.5 w-3.5" />
        Reprendre les infos d&apos;un apprenant
      </button>

      {open && (
        <div className="absolute z-20 mt-2 right-0 w-80 rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-700">
              Apprenants de cette entreprise
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-500"
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {pending || learners === null ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                Chargement…
              </div>
            ) : learners.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500 italic">
                Aucun apprenant enregistré pour cette entreprise.
              </div>
            ) : (
              <ul>
                {learners.map((l) => {
                  const name = [l.civility, l.first_name, l.last_name]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => pick(l)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-cyan-50 flex flex-col"
                      >
                        <span className="font-medium text-slate-900">
                          {name || "Apprenant"}
                        </span>
                        {l.job_title && (
                          <span className="text-[11px] text-slate-500">
                            {l.job_title}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
