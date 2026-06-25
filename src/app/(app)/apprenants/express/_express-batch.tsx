"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  Loader2,
  Search,
  Users,
  Wand2,
} from "lucide-react";
import { SireneLookup } from "../../entreprises/_sirene-lookup";
import {
  attachManyLearnersToCompany,
  autoAttachExactExpressMatches,
  createCompanyFromSireneAndAttachMany,
  markExpressValidated,
  type CompanySuggestion,
} from "../express-actions";

export type ExpressGroup = {
  key: string;
  displayName: string;
  hasName: boolean;
  /** true si les apprenants ont déjà une entreprise (il reste à « valider »). */
  alreadyAttached: boolean;
  companyId: string | null;
  siretTemp: string | null;
  learners: { id: string; name: string }[];
  matches: CompanySuggestion[];
};

export function ExpressBatch({
  groups,
  totalLearners,
  exactCount,
}: {
  groups: ExpressGroup[];
  totalLearners: number;
  exactCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openSireneKey, setOpenSireneKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function runAuto() {
    setMsg(null);
    startTransition(async () => {
      const res = await autoAttachExactExpressMatches();
      if (res.ok) {
        setMsg({
          ok: true,
          text: `${res.attached} apprenant(s) rattaché(s) automatiquement. ${res.remaining} à traiter à la main.`,
        });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error ?? "Échec." });
      }
    });
  }

  function validateGroup(g: ExpressGroup) {
    setMsg(null);
    setBusyKey(g.key);
    startTransition(async () => {
      const res = await markExpressValidated(g.learners.map((l) => l.id));
      setBusyKey(null);
      if (res.ok) {
        setMsg({ ok: true, text: `${res.count} apprenant(s) validé(s).` });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error ?? "Échec de la validation." });
      }
    });
  }

  function attachGroup(g: ExpressGroup, companyId: string) {
    setMsg(null);
    setBusyKey(g.key);
    startTransition(async () => {
      const res = await attachManyLearnersToCompany(
        g.learners.map((l) => l.id),
        companyId,
      );
      setBusyKey(null);
      if (res.ok) {
        setMsg({ ok: true, text: `${res.count} apprenant(s) rattaché(s).` });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error ?? "Échec du rattachement." });
      }
    });
  }

  function scoreLabel(m: CompanySuggestion): { text: string; cls: string } {
    if (m.exact)
      return {
        text: "Exact",
        cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
      };
    if (m.score >= 0.9)
      return {
        text: "Très proche",
        cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    return { text: "Proche", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  }

  return (
    <div className="space-y-4">
      {/* Bandeau récap + automatisme */}
      <div className="rounded-xl border border-cyan-200 bg-cyan-50 dark:bg-cyan-950/20 p-4 flex flex-wrap items-center gap-3">
        <div className="mr-auto text-sm text-cyan-900 dark:text-cyan-200">
          <strong>{totalLearners}</strong> apprenant(s) Express à rattacher,
          regroupés en <strong>{groups.length}</strong> entreprise(s).
        </div>
        {exactCount > 0 && (
          <button
            type="button"
            onClick={runAuto}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60 min-h-[44px]"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Rattacher auto. les correspondances exactes ({exactCount})
          </button>
        )}
      </div>

      {msg && (
        <p
          className={`text-sm font-medium ${
            msg.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {msg.text}
        </p>
      )}

      {/* Groupes */}
      {groups.map((g) => {
        const ids = g.learners.map((l) => l.id);
        const isBusy = busyKey === g.key && pending;
        return (
          <div
            key={g.key}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 text-zinc-400" />
              <span className="font-semibold text-sm">{g.displayName}</span>
              {g.siretTemp && (
                <span className="text-[11px] text-zinc-500">
                  SIRET saisi : {g.siretTemp}
                </span>
              )}
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-500">
                <Users className="h-3.5 w-3.5" />
                {g.learners.length} apprenant(s)
              </span>
            </div>

            <div className="text-xs text-zinc-500">
              {g.learners.map((l) => l.name).join(", ")}
            </div>

            {g.alreadyAttached ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-emerald-700">
                  Déjà rattaché à <strong>{g.displayName}</strong> — il reste à
                  valider (retirer le badge Express).
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => validateGroup(g)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 min-h-[36px] whitespace-nowrap"
                >
                  {isBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Valider les {g.learners.length}
                </button>
              </div>
            ) : !g.hasName ? (
              <p className="text-xs text-amber-700">
                Nom d&apos;entreprise non renseigné — à compléter
                individuellement sur chaque fiche apprenant.
              </p>
            ) : (
              <>
                {/* Correspondances base */}
                {g.matches.length > 0 && (
                  <div className="space-y-1.5">
                    {g.matches.map((m) => {
                      const lbl = scoreLabel(m);
                      const cpVille = [m.postal_code, m.city]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2"
                        >
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
                            onClick={() => attachGroup(g, m.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 min-h-[36px] whitespace-nowrap"
                          >
                            {isBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            Rattacher les {g.learners.length}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {g.matches.length === 0 && (
                  <p className="text-xs text-zinc-500">
                    Aucune entreprise proche en base — recherchez dans SIRENE.
                  </p>
                )}

                {/* SIRENE */}
                {openSireneKey === g.key ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-amber-900/80 uppercase tracking-wide">
                      Annuaire officiel (SIRENE / INSEE)
                    </p>
                    <SireneLookup
                      compact
                      initialQuery={g.displayName}
                      onPick={(c) => {
                        setMsg(null);
                        setBusyKey(g.key);
                        startTransition(async () => {
                          const res =
                            await createCompanyFromSireneAndAttachMany(ids, {
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
                            });
                          setBusyKey(null);
                          if (res.ok) {
                            setMsg({
                              ok: true,
                              text: `${res.count} apprenant(s) rattaché(s) à ${c.name}.`,
                            });
                            router.refresh();
                          } else {
                            setMsg({
                              ok: false,
                              text: res.error ?? "Échec.",
                            });
                          }
                        });
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenSireneKey(g.key)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 min-h-[36px]"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Chercher dans SIRENE
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
