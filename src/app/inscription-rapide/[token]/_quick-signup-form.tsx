"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Search, UserCheck, X } from "lucide-react";
import {
  searchExistingLearners,
  submitQuickSignupExisting,
  type ExistingLearnerCandidate,
} from "./actions";

const inputCls =
  "w-full h-11 rounded-md border border-zinc-300 px-3 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none";

/**
 * Formulaire d'inscription rapide (QR) avec ANTI-DOUBLON (Gilles 2026-06-26).
 * Dès que nom + prénom (et éventuellement email) sont saisis, on cherche un
 * apprenant déjà connu : « Sauf erreur, vous avez déjà fait une formation
 * avec X — est-ce bien vous ? ». Si oui -> on réutilise sa fiche. Sinon
 * (« Ce n'est pas moi »), la saisie normale continue.
 */
export function QuickSignupForm({
  token,
  orgName,
  action,
}: {
  token: string;
  orgName: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ExistingLearnerCandidate[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runSearch() {
    if (dismissed) return;
    const fn = firstName.trim();
    const ln = lastName.trim();
    const mail = email.trim();
    if ((!fn || !ln) && !mail) return;
    setSearching(true);
    searchExistingLearners(token, fn, ln, mail)
      .then((res) => setCandidates(res))
      .catch(() => setCandidates([]))
      .finally(() => setSearching(false));
  }

  function chooseExisting(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await submitQuickSignupExisting(token, id);
      // En cas de succès, l'action redirige (pas de retour). Sinon, erreur.
      if (res && !res.ok) setError(res.error);
    });
  }

  const showPanel = !dismissed && candidates.length > 0;

  return (
    <form
      action={action}
      className="rounded-xl bg-white border border-zinc-200 shadow-sm p-4 space-y-3"
    >
      <div className="grid grid-cols-1 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-zinc-700">
            Votre société / employeur <span className="text-red-500">*</span>
          </span>
          <input
            name="company_name_temp"
            type="text"
            required
            autoComplete="organization"
            className={inputCls}
            placeholder="Ex. SARL Dupont"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-zinc-700">
            SIRET (optionnel — 14 chiffres)
          </span>
          <input
            name="company_siret_temp"
            type="text"
            inputMode="numeric"
            pattern="[0-9 ]*"
            maxLength={18}
            className={inputCls}
          />
        </label>

        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1 col-span-1">
            <span className="text-xs font-medium text-zinc-700">Civilité</span>
            <select
              name="civility"
              className="w-full h-11 rounded-md border border-zinc-300 px-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none bg-white"
              defaultValue=""
            >
              <option value="">—</option>
              <option value="Mme">Mme</option>
              <option value="M.">M.</option>
            </select>
          </label>
          <label className="space-y-1 col-span-2">
            <span className="text-xs font-medium text-zinc-700">Fonction</span>
            <input
              name="job_title"
              type="text"
              autoComplete="organization-title"
              className={inputCls}
            />
          </label>
        </div>

        <label className="space-y-1">
          <span className="text-xs font-medium text-zinc-700">
            Prénom <span className="text-red-500">*</span>
          </span>
          <input
            name="first_name"
            type="text"
            required
            autoComplete="given-name"
            className={inputCls}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onBlur={runSearch}
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
            autoComplete="family-name"
            className={inputCls}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onBlur={runSearch}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-zinc-700">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            className={inputCls}
            placeholder="prenom.nom@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={runSearch}
          />
          <span className="text-[11px] text-zinc-500">
            Recommandé pour recevoir l&apos;attestation à la fin de la formation.
          </span>
        </label>
      </div>

      {/* Recherche en cours */}
      {searching && !showPanel && (
        <p className="text-xs text-zinc-500 inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Je recherche si vous êtes déjà connu(e)…
        </p>
      )}

      {/* Panneau anti-doublon */}
      {showPanel && (
        <div className="rounded-xl border-2 border-cyan-300 bg-cyan-50 p-3 space-y-2">
          <p className="text-sm font-semibold text-cyan-900 inline-flex items-center gap-1.5">
            <Search className="h-4 w-4" />
            Sauf erreur de notre part, vous avez déjà fait une formation avec{" "}
            {orgName}.
          </p>
          <p className="text-xs text-cyan-800">Est-ce bien vous ?</p>
          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-900 truncate">
                    {c.fullName}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {[c.company, c.cpVille].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => chooseExisting(c.id)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-700 disabled:opacity-60 whitespace-nowrap"
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserCheck className="h-3.5 w-3.5" />
                  )}
                  Oui, c&apos;est moi
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-900 underline"
          >
            <X className="h-3.5 w-3.5" />
            Ce n&apos;est pas moi — continuer mon inscription
          </button>
          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
        </div>
      )}

      <button
        type="submit"
        className="w-full h-12 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm transition inline-flex items-center justify-center gap-1.5"
      >
        <Check className="h-4 w-4" />
        Valider &amp; commencer le questionnaire →
      </button>

      <p className="text-[10px] text-zinc-400 text-center">
        Les champs marqués d&apos;un astérisque (*) sont obligatoires. Vos
        données sont enregistrées par l&apos;organisme de formation uniquement
        pour les besoins administratifs (feuille de présence, attestation).
      </p>
    </form>
  );
}
