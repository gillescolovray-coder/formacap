"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Building2, GitMerge, Loader2, Search, X } from "lucide-react";
import {
  mergeCompanyInto,
  searchCompaniesForMerge,
  type CompanyCandidate,
} from "../merge-actions";

/**
 * Bouton + modale "Fusionner une fiche en double DANS celle-ci".
 * La fiche courante (targetId) est CONSERVÉE ; la fiche choisie est
 * absorbée (ses apprenants, contacts, inscriptions… sont rebasculés)
 * puis supprimée. Gilles 2026-06-04.
 */
export function MergeCompanyButton({
  targetId,
  targetName,
}: {
  targetId: string;
  targetName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CompanyCandidate | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function runSearch(q: string) {
    setQuery(q);
    setSelected(null);
    setSearching(true);
    try {
      const res = await searchCompaniesForMerge(targetId, q);
      setResults(res);
    } finally {
      setSearching(false);
    }
  }

  function openModal() {
    setOpen(true);
    setError(null);
    setSelected(null);
    setQuery("");
    void runSearch("");
  }

  function confirmMerge() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await mergeCompanyInto(targetId, selected.id);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Fusionner une fiche en double dans celle-ci"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100"
      >
        <GitMerge className="h-4 w-4" />
        Fusionner un doublon
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="mt-10 w-full max-w-md rounded-2xl bg-white shadow-xl border border-zinc-200 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-200 bg-zinc-50">
              <h2 className="text-sm font-bold text-zinc-900 inline-flex items-center gap-1.5">
                <GitMerge className="h-4 w-4 text-amber-600" />
                Fusionner un doublon
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-700"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-zinc-600">
                La fiche{" "}
                <strong className="text-zinc-900">{targetName}</strong> sera{" "}
                <strong>conservée</strong>. La fiche que vous choisissez
                ci-dessous sera <strong>absorbée</strong> (ses apprenants,
                contacts, inscriptions et documents sont rebasculés) puis{" "}
                <strong>supprimée</strong>. Action irréversible.
              </p>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => void runSearch(e.target.value)}
                  placeholder="Rechercher la fiche en double (nom ou SIRET)…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200 divide-y divide-zinc-100">
                {searching ? (
                  <div className="p-4 text-center text-xs text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin inline" /> Recherche…
                  </div>
                ) : results.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-400">
                    Aucune autre fiche trouvée.
                  </div>
                ) : (
                  results.map((c) => {
                    const isSel = selected?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelected(c)}
                        className={
                          "w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-amber-50 " +
                          (isSel ? "bg-amber-100" : "")
                        }
                      >
                        <Building2 className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-900 break-words">
                            {c.name}
                          </span>
                          <span className="block text-[11px] text-zinc-500">
                            {[
                              c.type,
                              c.siret,
                              [c.postal_code, c.city].filter(Boolean).join(" "),
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {error && (
                <div className="text-xs px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-800">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={confirmMerge}
                  disabled={!selected || pending}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GitMerge className="h-4 w-4" />
                  )}
                  {selected
                    ? `Absorber « ${selected.name.slice(0, 24)} »`
                    : "Choisir une fiche"}
                </button>
              </div>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
