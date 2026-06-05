"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";

type Props = {
  learnerId: string;
  isTemporary: boolean;
  initial: {
    civility: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    jobTitle: string | null;
    companyNameTemp: string | null;
    companySiretTemp: string | null;
  };
  updateAction: (
    learnerId: string,
    formData: FormData,
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteAction: (
    learnerId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
};

/**
 * Boutons "éditer" + "supprimer" affichés à droite de chaque apprenant
 * dans la liste Participants du portail formateur. Limité aux apprenants
 * temporaires (saisie express sous-traitance) : pour les autres, on
 * affiche un petit badge "Inscrit par l'OF" en lecture seule.
 *
 * Gilles 2026-05-24 : "uniquement les apprenants qu'il a inscrit".
 */
export function ExpressLearnerActions({
  learnerId,
  isTemporary,
  initial,
  updateAction,
  deleteAction,
}: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Apprenant inscrit officiellement (non temporaire) : aucune action
  // d'édition côté formateur (réservé admin). On n'affiche AUCUNE icône
  // pour ne pas encombrer la ligne — le formateur n'en a pas besoin
  // (Gilles 2026-06-05, l'ancien badge "UserCheck + OF" prêtait à confusion).
  if (!isTemporary) {
    return null;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateAction(learnerId, fd);
      if (!res.ok) {
        setError(res.error ?? "Erreur.");
        return;
      }
      setEditOpen(false);
      router.refresh();
    });
  }

  function onDelete() {
    const name = [initial.firstName, initial.lastName]
      .filter(Boolean)
      .join(" ");
    const ok = confirm(
      `Supprimer définitivement ${name || "cet apprenant"} de la session ? Toutes ses données (quiz, signatures, etc.) seront perdues.`,
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAction(learnerId);
      if (!res.ok) {
        setError(res.error ?? "Suppression impossible.");
        return;
      }
      router.refresh();
    });
  }

  const modal = editOpen && (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={() => !pending && setEditOpen(false)}
    >
      <div className="min-h-full flex items-start sm:items-center justify-center p-4 py-8">
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-3 relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => !pending && setEditOpen(false)}
            className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-zinc-100 text-zinc-500"
            aria-label="Fermer"
            disabled={pending}
          >
            <X className="h-4 w-4" />
          </button>

          <header className="text-center space-y-1">
            <div className="text-xs uppercase tracking-widest text-amber-700 font-semibold">
              Modifier l&apos;apprenant
            </div>
            <h2 className="text-base font-bold text-zinc-900">
              Saisie express — sous-traitance
            </h2>
          </header>

          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-zinc-700">
                  Société (donneur d&apos;ordre / employeur)
                  <span className="text-red-500"> *</span>
                </span>
                <input
                  name="company_name_temp"
                  type="text"
                  required
                  defaultValue={initial.companyNameTemp ?? ""}
                  className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-zinc-700">
                  SIRET (optionnel)
                </span>
                <input
                  name="company_siret_temp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9 ]*"
                  maxLength={18}
                  defaultValue={initial.companySiretTemp ?? ""}
                  className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-700">
                  Civilité
                </span>
                <select
                  name="civility"
                  defaultValue={initial.civility ?? ""}
                  className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none bg-white"
                >
                  <option value="">—</option>
                  <option value="Mme">Mme</option>
                  <option value="M.">M.</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-700">
                  Fonction
                </span>
                <input
                  name="job_title"
                  type="text"
                  defaultValue={initial.jobTitle ?? ""}
                  className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-700">
                  Prénom <span className="text-red-500">*</span>
                </span>
                <input
                  name="first_name"
                  type="text"
                  required
                  defaultValue={initial.firstName ?? ""}
                  className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-700">
                  Nom <span className="text-red-500">*</span>
                </span>
                <input
                  name="last_name"
                  type="text"
                  required
                  defaultValue={initial.lastName ?? ""}
                  className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-zinc-700">
                  Email
                </span>
                <input
                  name="email"
                  type="email"
                  defaultValue={initial.email ?? ""}
                  className="w-full h-9 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                />
              </label>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => !pending && setEditOpen(false)}
                disabled={pending}
                className="h-9 px-3 rounded-md border border-zinc-300 text-sm hover:bg-zinc-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={pending}
                className="h-9 px-3 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {pending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <span className="inline-flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          disabled={pending}
          title="Modifier les infos de l'apprenant"
          className="p-1 rounded-md text-amber-700 hover:bg-amber-50 disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          title="Supprimer cet apprenant"
          className="p-1 rounded-md text-rose-600 hover:bg-rose-50 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </span>
      {error && !editOpen && (
        <span className="block text-[10px] text-red-700 mt-0.5">{error}</span>
      )}
      {mounted ? createPortal(modal, document.body) : null}
    </>
  );
}
