"use client";

import { useRef } from "react";
import { Copy, Shield } from "lucide-react";

type Props = {
  /** Prefixe des `name` / `id` (utile en cas d'embedded form). */
  prefix?: string;
  /** Valeurs initiales (companies.representant_*) si l'entreprise
   *  selectionnee en a deja. */
  initial?: {
    civility: string | null;
    firstName: string | null;
    lastName: string | null;
    jobTitle: string | null;
  };
  /** IDs des champs apprenant correspondants pour le bouton
   *  "C'est le meme que l'apprenant" (copie civilite/prenom/nom +
   *  fonction par defaut "Gerant"). */
  learnerFieldIds?: {
    civility?: string;
    firstName?: string;
    lastName?: string;
  };
};

/**
 * Mini-bloc "Representant legal" pour le formulaire d'inscription
 * (admin et partenaire). Permet de saisir / modifier les 4 champs
 * du representant legal qui seront propages au companies.representant_*
 * lors de la creation de l'inscription.
 *
 * Bouton "C'est le meme que l'apprenant" qui prefill les 4 champs
 * depuis les champs apprenant du meme formulaire (cas gerant qui
 * fait sa propre formation). Gilles 2026-05-28.
 */
export function LegalRepFieldset({
  prefix = "",
  initial,
  learnerFieldIds,
}: Props) {
  const civilityRef = useRef<HTMLSelectElement | null>(null);
  const firstNameRef = useRef<HTMLInputElement | null>(null);
  const lastNameRef = useRef<HTMLInputElement | null>(null);
  const jobTitleRef = useRef<HTMLInputElement | null>(null);

  function copyFromLearner() {
    if (!learnerFieldIds) return;
    const get = (id?: string) =>
      id
        ? (document.getElementById(id) as
            | HTMLInputElement
            | HTMLSelectElement
            | null
          )?.value ?? ""
        : "";
    const civ = get(learnerFieldIds.civility);
    const fn = get(learnerFieldIds.firstName);
    const ln = get(learnerFieldIds.lastName);

    const setVal = (
      ref: React.RefObject<HTMLInputElement | HTMLSelectElement | null>,
      value: string,
    ) => {
      if (!ref.current) return;
      // Setter React-friendly via prototype descriptor.
      const Proto =
        ref.current instanceof HTMLSelectElement
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(Proto, "value")?.set;
      if (setter) setter.call(ref.current, value);
      else (ref.current as HTMLInputElement).value = value;
      ref.current.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setVal(civilityRef, civ);
    setVal(firstNameRef, fn);
    setVal(lastNameRef, ln.toLocaleUpperCase("fr-FR"));
    // Suggestion fonction par defaut quand le gerant fait sa propre
    // formation (a editer si besoin).
    setVal(jobTitleRef, jobTitleRef.current?.value || "Gérant");
  }

  return (
    <div className="rounded-lg border-2 border-amber-200 bg-amber-50/40 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 flex-1 min-w-[220px]">
          <Shield className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-900">
              Représentant légal de la société
            </p>
            <p className="text-[11px] text-amber-800 italic">
              Optionnel — apparaîtra sur la convention de formation
              comme signataire (PDG, gérant…).
            </p>
          </div>
        </div>
        {learnerFieldIds && (
          <button
            type="button"
            onClick={copyFromLearner}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 shadow-sm shrink-0"
          >
            <Copy className="h-3.5 w-3.5" />
            C&apos;est le même que l&apos;apprenant
          </button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-[110px_1fr_1fr]">
        <div className="space-y-1">
          <label
            htmlFor={`${prefix}representant_civility`}
            className="text-[11px] font-medium text-slate-700"
          >
            Civilité
          </label>
          <select
            ref={civilityRef}
            id={`${prefix}representant_civility`}
            name={`${prefix}representant_civility`}
            defaultValue={initial?.civility ?? ""}
            className="flex h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
          >
            <option value="">—</option>
            <option value="M.">M.</option>
            <option value="Mme">Mme</option>
          </select>
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`${prefix}representant_first_name`}
            className="text-[11px] font-medium text-slate-700"
          >
            Prénom
          </label>
          <input
            ref={firstNameRef}
            id={`${prefix}representant_first_name`}
            name={`${prefix}representant_first_name`}
            defaultValue={initial?.firstName ?? ""}
            placeholder="Jean"
            className="flex h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`${prefix}representant_last_name`}
            className="text-[11px] font-medium text-slate-700"
          >
            Nom
          </label>
          <input
            ref={lastNameRef}
            id={`${prefix}representant_last_name`}
            name={`${prefix}representant_last_name`}
            defaultValue={initial?.lastName ?? ""}
            placeholder="DUPONT"
            className="flex h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm uppercase focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label
          htmlFor={`${prefix}representant_job_title`}
          className="text-[11px] font-medium text-slate-700"
        >
          Fonction{" "}
          <span className="text-slate-500 font-normal">
            (Gérant, PDG, Président…)
          </span>
        </label>
        <input
          ref={jobTitleRef}
          id={`${prefix}representant_job_title`}
          name={`${prefix}representant_job_title`}
          defaultValue={initial?.jobTitle ?? ""}
          placeholder="Gérant"
          className="flex h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
        />
      </div>
    </div>
  );
}
