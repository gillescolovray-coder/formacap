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
  defaultSubcontractingCompanyId?: string;
};

/**
 * Champs « Organisme donneur d'ordre » + « Prescripteur référent ».
 * Sous-composant client pour pouvoir surligner visuellement chaque bloc
 * dès qu'une valeur est saisie/sélectionnée — utile parce que ces deux
 * informations sont facilement oubliées dans le scroll d'un formulaire
 * de session déjà long.
 *
 * Refonte 2026-06-01 (Gilles) : le champ "Organisme donneur d ordre" est
 * desormais un dropdown qui pointe vers une fiche OF du module Entreprises
 * (via subcontracting_company_id FK). Cela permet au portail de l OF
 * concerne d afficher ces sessions de sous-traitance.
 */
export function SubcontractPrescriberFields({
  companies,
  defaultSubcontractorName,
  defaultPrescriberCompanyId,
  defaultSubcontractingCompanyId,
}: Props) {
  const [subName, setSubName] = useState(defaultSubcontractorName ?? "");
  const [prescriberId, setPrescriberId] = useState(
    defaultPrescriberCompanyId ?? "",
  );
  const [subcontractingCompanyId, setSubcontractingCompanyId] = useState(
    defaultSubcontractingCompanyId ?? "",
  );

  const subFilled =
    subName.trim().length > 0 || subcontractingCompanyId.length > 0;
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
        <Label htmlFor="subcontracting_company_id">
          Organisme donneur d&apos;ordre (si sous-traitance)
        </Label>
        {/* Dropdown OF officiels (lie au module Entreprises type=OF).
            Permet au portail de cet OF d afficher la session dans son
            catalogue (Gilles 2026-06-01). */}
        <select
          id="subcontracting_company_id"
          name="subcontracting_company_id"
          value={subcontractingCompanyId}
          onChange={(e) => {
            setSubcontractingCompanyId(e.target.value);
            // Auto-rempli aussi le nom libre pour compat existante
            const selected = (companies ?? []).find(
              (c) => c.id === e.target.value,
            );
            if (selected) setSubName(selected.name);
          }}
          className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          <option value="">— Aucun (CAP NUMÉRIQUE est l&apos;organisateur direct) —</option>
          {(companies ?? [])
            .filter((c) => c.type === "of")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <p className="text-xs text-zinc-500">
          Sélectionnez l&apos;OF donneur d&apos;ordre. La session apparaîtra
          dans son portail (Catalogue) avec accès aux quiz / émargement /
          attestations de ses apprenants.
        </p>
        {/* Champ texte libre garde en cache de l ancien systeme et pour
            l affichage sur les documents (convention etc). Synchronise
            automatiquement avec la selection ci-dessus. */}
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-500">
            Variante texte libre (si l&apos;OF n&apos;est pas encore créé)
          </summary>
          <Input
            id="subcontractor_name"
            name="subcontractor_name"
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            placeholder="Raison sociale libre"
            className="mt-2"
          />
        </details>
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
