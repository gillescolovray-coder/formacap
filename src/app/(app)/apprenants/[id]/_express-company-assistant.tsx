"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Loader2, Search, Sparkles } from "lucide-react";
import { SireneLookup } from "../../entreprises/_sirene-lookup";
import {
  attachLearnerToCompany,
  createCompanyFromSireneAndAttach,
  suggestCompaniesForName,
  type CompanySuggestion,
} from "../express-actions";

/**
 * Assistant de rattachement d'entreprise pour un apprenant « Express »
 * (Gilles 2026-06-25). À l'ouverture, cherche dans la base les entreprises
 * au nom PROCHE de celui saisi en texte libre, propose un rattachement en
 * 1 clic, et offre une recherche SIRENE/INSEE si rien ne correspond.
 */
export function ExpressCompanyAssistant({
  learnerId,
  companyNameTemp,
  companySiretTemp,
}: {
  learnerId: string;
  companyNameTemp: string | null;
  companySiretTemp: string | null;
}) {
  const router = useRouter();
  const [matches, setMatches] = useState<CompanySuggestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [showSirene, setShowSirene] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = (companyNameTemp ?? "").trim();

  useEffect(() => {
    let alive = true;
    if (!query) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    suggestCompaniesForName(query)
      .then((res) => {
        if (!alive) return;
        setMatches(res);
        // Si aucune correspondance en base, on ouvre directement SIRENE.
        if (res.length === 0) setShowSirene(true);
      })
      .catch(() => alive && setMatches([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query]);

  function attach(companyId: string) {
    setError(null);
    startTransition(async () => {
      const res = await attachLearnerToCompany(learnerId, companyId);
      if (res.ok) router.refresh();
      else setError(res.error ?? "Échec du rattachement.");
    });
  }

  function scoreLabel(m: CompanySuggestion): { text: string; cls: string } {
    if (m.exact)
      return {
        text: "Correspondance exacte",
        cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
      };
    if (m.score >= 0.9)
      return {
        text: "Très proche",
        cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    return {
      text: "Proche",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Apprenant Express — rattacher son entreprise
          </h3>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
            Entreprise saisie :{" "}
            <strong>{query || "(non renseignée)"}</strong>
            {companySiretTemp ? ` · SIRET ${companySiretTemp}` : ""}
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      )}

      {loading ? (
        <p className="text-xs text-amber-800 inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Recherche des
          entreprises proches…
        </p>
      ) : (
        <>
          {/* Correspondances dans la base */}
          {matches && matches.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-amber-900/80 uppercase tracking-wide">
                Entreprises existantes proposées
              </p>
              <ul className="space-y-1.5">
                {matches.map((m) => {
                  const lbl = scoreLabel(m);
                  const cpVille = [m.postal_code, m.city]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
                    >
                      <Building2 className="h-4 w-4 text-zinc-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {m.name}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${lbl.cls} whitespace-nowrap`}
                          >
                            {lbl.text}
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-500">
                          {cpVille}
                          {m.siret ? ` · SIRET ${m.siret}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => attach(m.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 min-h-[36px] whitespace-nowrap"
                      >
                        {pending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        {m.exact ? "Rattacher (recommandé)" : "Rattacher"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {matches && matches.length === 0 && (
            <p className="text-xs text-amber-800">
              Aucune entreprise proche trouvée dans votre base. Recherchez-la
              dans l&apos;annuaire officiel (SIRENE) ci-dessous.
            </p>
          )}

          {/* Recherche SIRENE / INSEE */}
          <div className="pt-1">
            {!showSirene ? (
              <button
                type="button"
                onClick={() => setShowSirene(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 min-h-[36px]"
              >
                <Search className="h-3.5 w-3.5" />
                Aucune ne convient → chercher dans SIRENE
              </button>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-white dark:bg-zinc-900 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-amber-900/80 uppercase tracking-wide">
                  Annuaire officiel (SIRENE / INSEE)
                </p>
                <SireneLookup
                  compact
                  initialQuery={query}
                  onPick={(c) => {
                    setError(null);
                    startTransition(async () => {
                      const res = await createCompanyFromSireneAndAttach(
                        learnerId,
                        {
                          name: c.name,
                          siret: c.siret,
                          siren: c.siren,
                          legal_form: c.legal_form,
                          industry: c.industry ?? c.naf_code,
                          naf_code: c.naf_code,
                          legal_status: c.legal_status,
                          pappers_url: c.pappers_url,
                          address: c.address,
                          postal_code: c.postal_code,
                          city: c.city,
                        },
                      );
                      if (res.ok) router.refresh();
                      else
                        setError(
                          res.error ?? "Échec de la création / rattachement.",
                        );
                    });
                  }}
                />
                <p className="text-[11px] text-zinc-500">
                  En sélectionnant une entreprise, sa fiche (avec SIRET) est
                  créée et l&apos;apprenant y est rattaché automatiquement.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
