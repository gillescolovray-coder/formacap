"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Building2, Plus, Search, X, Loader2 } from "lucide-react";
import {
  searchCompaniesForAttach,
  attachInscriptionToCompany,
  createCompanyAndAttach,
  type AttachCompanyCandidate,
} from "./actions";
import { useRouter } from "next/navigation";

/**
 * Bouton « Rattacher à une entreprise » (Gilles 2026-06-08) pour les
 * inscriptions express dont l'entreprise est en texte libre (pas de fiche).
 * Recherche une fiche existante OU crée une nouvelle fiche au nom saisi.
 * Rendu en portal (règle projet) pour ne pas être masqué.
 */
export function AttachCompanyButton({
  inscriptionId,
  currentName,
}: {
  inscriptionId: string;
  currentName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState(currentName ?? "");
  const [results, setResults] = useState<AttachCompanyCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  // Recherche (debounce léger)
  useEffect(() => {
    if (!open) return;
    setSearching(true);
    const h = setTimeout(() => {
      searchCompaniesForAttach(query)
        .then((r) => setResults(r))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(h);
  }, [open, query]);

  function handleAttach(companyId: string) {
    setError(null);
    startTransition(async () => {
      const res = await attachInscriptionToCompany(inscriptionId, companyId);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "Rattachement impossible.");
      }
    });
  }

  function handleCreate() {
    const name = (currentName ?? query).trim();
    if (!name) {
      setError("Saisissez un nom d'entreprise.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createCompanyAndAttach(inscriptionId, name);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "Création impossible.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-700 hover:text-cyan-800 hover:underline"
        title="Rattacher cet apprenant à une fiche entreprise"
      >
        <Building2 className="h-3 w-3" />
        Rattacher à une entreprise
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] bg-black/40 flex items-start justify-center p-4 pt-[10vh]"
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
                <h3 className="font-bold text-sm text-zinc-900 inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-cyan-600" />
                  Rattacher à une entreprise
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-zinc-400 hover:text-zinc-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher une entreprise…"
                    autoFocus
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                </div>

                {/* Créer la fiche au nom saisi */}
                {(currentName ?? query).trim() && (
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={pending}
                    className="w-full inline-flex items-center gap-1.5 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Créer la fiche « {(currentName ?? query).trim()} »
                  </button>
                )}

                {/* Résultats */}
                <div className="max-h-60 overflow-y-auto divide-y divide-zinc-100 border border-zinc-200 rounded-lg">
                  {searching ? (
                    <p className="text-xs text-zinc-400 p-3 text-center">
                      Recherche…
                    </p>
                  ) : results.length === 0 ? (
                    <p className="text-xs text-zinc-400 p-3 text-center">
                      Aucune entreprise trouvée.
                    </p>
                  ) : (
                    results.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleAttach(c.id)}
                        disabled={pending}
                        className="w-full text-left px-3 py-2 hover:bg-cyan-50 disabled:opacity-60"
                      >
                        <div className="text-sm font-medium text-zinc-800">
                          {c.name}
                        </div>
                        {(c.postal_code || c.city) && (
                          <div className="text-[11px] text-zinc-500">
                            {[c.postal_code, c.city].filter(Boolean).join(" ")}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>

                {error && (
                  <p className="text-xs text-red-600 font-medium">{error}</p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
