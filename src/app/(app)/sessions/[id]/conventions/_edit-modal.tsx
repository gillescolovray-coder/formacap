"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateConvention } from "./actions";

const FINANCING_MODES: Array<{ value: string; label: string }> = [
  { value: "opco", label: "OPCO (entreprise via son OPCO)" },
  { value: "plan_developpement", label: "Plan de développement (entreprise paye direct)" },
  { value: "cpf", label: "CPF (Compte Personnel de Formation)" },
  { value: "autofinancement", label: "Autofinancement" },
  { value: "pole_emploi", label: "Pôle Emploi / France Travail" },
  { value: "fse", label: "FSE (Fonds Social Européen)" },
  { value: "region", label: "Région" },
  { value: "autre", label: "Autre" },
];

export type ConventionEditableFields = {
  conventionId: string;
  contactName: string | null;
  contactEmail: string | null;
  amountHtUnit: number | null;
  financingMode: string | null;
  nbApprenants: number;
};

/**
 * Bouton "Modifier" qui ouvre une modale permettant d'éditer :
 *  - Le prix unitaire HT (recalcule auto le total)
 *  - Le mode de financement (OPCO / Plan / CPF / Autres)
 *  - Le contact RH signataire (nom + email)
 *
 * Le total HT est figé sur la convention pour le suivi du CA.
 */
export function ConventionEditButton({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: ConventionEditableFields;
}) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState(initial.amountHtUnit?.toString() ?? "");
  const [mode, setMode] = useState(initial.financingMode ?? "");
  const [name, setName] = useState(initial.contactName ?? "");
  const [email, setEmail] = useState(initial.contactEmail ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const unitNumber = parseFloat(unit.replace(",", ".")) || 0;
  const total = unitNumber * initial.nbApprenants;

  const onSubmit = () => {
    setError(null);
    const fd = new FormData();
    fd.set("amount_ht_unit", unit);
    fd.set("financing_mode", mode);
    fd.set("contact_name", name);
    fd.set("contact_email", email);
    startTransition(async () => {
      const res = await updateConvention(sessionId, initial.conventionId, fd);
      if (res.ok) {
        setOpen(false);
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Modifier le prix, le mode de financement, le RH signataire"
      >
        <Pencil className="h-3.5 w-3.5" />
        Modifier
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <h2 className="text-lg font-bold">Modifier la convention</h2>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Prix unitaire */}
              <div className="space-y-1.5">
                <Label htmlFor="amount_ht_unit">
                  Prix unitaire HT par apprenant
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="amount_ht_unit"
                    type="number"
                    step="0.01"
                    min="0"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="340.00"
                    className="flex-1"
                  />
                  <span className="text-sm text-zinc-500">€ HT</span>
                </div>
                <p className="text-xs text-zinc-500">
                  ×{" "}
                  <strong>{initial.nbApprenants}</strong> apprenant
                  {initial.nbApprenants > 1 ? "s" : ""} ={" "}
                  <strong className="text-blue-700">
                    {total.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}{" "}
                    € HT
                  </strong>{" "}
                  total
                </p>
              </div>

              {/* Mode de financement */}
              <div className="space-y-1.5">
                <Label htmlFor="financing_mode">Mode de financement</Label>
                <select
                  id="financing_mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                >
                  <option value="">— Non précisé —</option>
                  {FINANCING_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-zinc-500">
                  Détermine le modèle de document utilisé et les mentions
                  spécifiques (OPCO, CPF…).
                </p>
              </div>

              {/* Contact RH */}
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="contact_name">
                    Signataire (Nom)
                  </Label>
                  <Input
                    id="contact_name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Prénom Nom"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact_email">Signataire (Email)</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rh@entreprise.com"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">
                  {error}
                </div>
              )}
            </div>

            <footer className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button onClick={onSubmit} disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Pencil className="h-4 w-4" />
                )}
                Enregistrer
              </Button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
