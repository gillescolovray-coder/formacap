"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CompanyOption = {
  id: string;
  name: string;
  type?: string | null;
};

type Props = {
  companies?: CompanyOption[];
  defaultSubcontractorName?: string;
  defaultPrescriberCompanyId?: string;
};

/**
 * Champs « Organisme donneur d'ordre » + « Prescripteur référent ».
 * Sous-composant client pour pouvoir surligner visuellement chaque bloc
 * dès qu'une valeur est saisie/sélectionnée — utile parce que ces deux
 * informations sont facilement oubliées dans le scroll d'un formulaire
 * de session déjà long.
 */
export function SubcontractPrescriberFields({
  companies,
  defaultSubcontractorName,
  defaultPrescriberCompanyId,
}: Props) {
  const [subName, setSubName] = useState(defaultSubcontractorName ?? "");
  const [prescriberId, setPrescriberId] = useState(
    defaultPrescriberCompanyId ?? "",
  );

  const subFilled = subName.trim().length > 0;
  const prescriberFilled = prescriberId.length > 0;

  const subWrapper = subFilled
    ? "rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-950/30 p-3 transition-colors"
    : "p-3 transition-colors";

  const prescriberWrapper = prescriberFilled
    ? "rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-950/30 p-3 transition-colors"
    : "pt-2 border-t border-zinc-200 dark:border-zinc-800 transition-colors";

  return (
    <>
      <div className={`space-y-2 ${subWrapper}`}>
        <Label htmlFor="subcontractor_name">
          Organisme donneur d&apos;ordre (si sous-traitance)
        </Label>
        <Input
          id="subcontractor_name"
          name="subcontractor_name"
          list="subcontractor-companies"
          value={subName}
          onChange={(e) => setSubName(e.target.value)}
          placeholder="Sélectionnez ou tapez la raison sociale de l'OF principal"
        />
        {companies && companies.length > 0 && (
          <datalist id="subcontractor-companies">
            {companies.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        )}
        <p className="text-xs text-zinc-500">
          Tapez les premières lettres pour voir les OF déjà enregistrés dans
          le module Entreprises, ou saisissez une raison sociale libre.
        </p>
      </div>

      <div className={`space-y-2 ${prescriberWrapper}`}>
        <Label htmlFor="prescriber_company_id">Prescripteur référent</Label>
        <select
          id="prescriber_company_id"
          name="prescriber_company_id"
          value={prescriberId}
          onChange={(e) => setPrescriberId(e.target.value)}
          className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="">— Aucun —</option>
          {(companies ?? [])
            .filter((c) => c.type === "prescripteur")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <p className="text-xs text-zinc-500">
          Si renseigné, ce prescripteur verra cette session dans son portail
          partenaire (Espace partenaire → Catalogue). Utile pour les sessions
          INTRA dédiées à un prescripteur précis.
        </p>
      </div>
    </>
  );
}
