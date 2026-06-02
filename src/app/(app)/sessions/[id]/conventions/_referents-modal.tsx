"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Info, Loader2, Mail, Settings2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveSessionCompanyReferents } from "./actions";

export type CompanyContactItem = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  is_primary: boolean;
};

type Props = {
  sessionId: string;
  companyId: string;
  companyName: string;
  /** Tous les contacts disponibles de la société. */
  contacts: CompanyContactItem[];
  /** IDs des contacts actuellement sélectionnés comme référents. */
  initialSelectedIds: string[];
};

/**
 * Modal de sélection multi des référents pédagogiques pour une
 * session × société. Si rien n'est sélectionné, l'apprenant recevra
 * les documents par défaut.
 *
 * Rendu via React Portal (createPortal) avec position:fixed pour ne
 * pas être masqué par les overflow des parents (cf. règle Gilles
 * memory: feedback_dropdown_portal).
 */
export function ReferentsModal({
  sessionId,
  companyId,
  companyName,
  contacts,
  initialSelectedIds,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialSelectedIds),
  );
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // mount portal target only on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset selection when modal reopens
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(initialSelectedIds));
      setErrorMessage(null);
    }
  }, [open, initialSelectedIds]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await saveSessionCompanyReferents(
        sessionId,
        companyId,
        Array.from(selectedIds),
      );
      if (!res.ok) {
        setErrorMessage(res.error || "Erreur lors de l'enregistrement.");
        return;
      }
      setOpen(false);
    });
  };

  const selectedCount = selectedIds.size;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          selectedCount > 0
            ? "inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 hover:text-cyan-900 hover:underline"
            : "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-cyan-300 bg-cyan-50 text-cyan-700 text-[11px] font-bold hover:bg-cyan-100"
        }
        title={
          selectedCount > 0
            ? "Modifier la liste des référents pédagogiques de cette société"
            : "Choisir un contact de la société comme référent pédagogique (recevra les emails : convention, convocation, attestation…)"
        }
      >
        <Settings2 className="h-3 w-3" />
        {selectedCount > 0
          ? "Gérer les référents"
          : "Sélectionner un référent pédagogique"}
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 p-5 border-b border-zinc-200">
                  <div>
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-cyan-600" />
                      Référents pédagogiques — {companyName}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      Sélectionne 0, 1 ou plusieurs contacts de cette
                      société.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-zinc-400 hover:text-zinc-700 shrink-0"
                    aria-label="Fermer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Info bubble */}
                <div className="mx-5 mt-4 rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
                  <div className="text-[12px] text-blue-900 leading-relaxed">
                    <p className="font-semibold mb-0.5">
                      Comment ça marche ?
                    </p>
                    <ul className="list-disc ml-4 space-y-0.5">
                      <li>
                        <strong>Si des référents sont sélectionnés</strong> :
                        ils reçoivent les emails (convention, convocation,
                        attestation, facture…). L&apos;apprenant est en
                        copie.
                      </li>
                      <li>
                        <strong>Si aucun référent</strong> : l&apos;apprenant
                        reçoit directement l&apos;ensemble des documents.
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Liste contacts */}
                <div className="flex-1 overflow-y-auto p-5">
                  {contacts.length === 0 ? (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                      Aucun contact n&apos;est encore rattaché à cette
                      société. Ajoute d&apos;abord un contact sur la fiche
                      entreprise, puis reviens ici pour le sélectionner
                      comme référent.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {contacts.map((c) => {
                        const fullName = [c.first_name, c.last_name]
                          .filter(Boolean)
                          .join(" ") || "Contact sans nom";
                        const checked = selectedIds.has(c.id);
                        return (
                          <li key={c.id}>
                            <label
                              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                checked
                                  ? "bg-cyan-50 border-cyan-300 ring-1 ring-cyan-200"
                                  : "bg-white border-zinc-200 hover:bg-zinc-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggle(c.id)}
                                className="h-4 w-4 mt-0.5 rounded border-zinc-300 text-cyan-600 focus:ring-cyan-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm text-zinc-900">
                                    {fullName}
                                  </span>
                                  {c.is_primary && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-800">
                                      Contact principal
                                    </span>
                                  )}
                                </div>
                                {c.job_title && (
                                  <div className="text-xs text-zinc-600 mt-0.5">
                                    {c.job_title}
                                  </div>
                                )}
                                {c.email && (
                                  <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1 truncate">
                                    <Mail className="h-3 w-3 shrink-0" />
                                    {c.email}
                                  </div>
                                )}
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Footer */}
                {errorMessage && (
                  <div className="mx-5 mb-2 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-900">
                    {errorMessage}
                  </div>
                )}
                <div className="border-t border-zinc-200 p-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-600">
                    {selectedCount === 0
                      ? "Aucun référent — l'apprenant recevra les documents"
                      : `${selectedCount} référent${selectedCount > 1 ? "s" : ""} sélectionné${selectedCount > 1 ? "s" : ""}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setOpen(false)}
                      disabled={isPending}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSave}
                      disabled={isPending}
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        "Enregistrer"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
