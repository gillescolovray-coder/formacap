"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PhoneInput } from "@/components/ui/phone-input";
import { CompanyForm } from "../entreprises/_form";

type LearnerOption = {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string | null;
  /** Téléphone fixe (l'app a 2 champs sur learners : phone + mobile). */
  phone: string | null;
  /** Téléphone portable. Quand on inscrit l'apprenant, on PRIORISE
   *  mobile sur phone (plus fiable pour joindre une personne en
   *  formation). */
  mobile: string | null;
  job_title: string | null;
  civility: string | null;
  company_id: string | null;
  company_name: string | null;
};
type CompanyOption = { id: string; name: string };
type SessionOption = {
  id: string;
  label: string;
  meta?: string | null;
  modality?: string | null;
};

type Props = {
  learners: LearnerOption[];
  companies: CompanyOption[];
  sessions: SessionOption[];
  parcoursOptions: Array<{ id: string; label: string }>;
  defaults: {
    learnerId?: string | null;
    companyId?: string | null;
    sessionId?: string | null;
    parcoursId?: string | null;
    formationId?: string | null;
    companyFreetext?: string | null;
    prospectFirstName?: string | null;
    prospectLastName?: string | null;
    prospectEmail?: string | null;
    prospectPhone?: string | null;
    /** Mobile (champ distinct du fixe — R6+ 2026-05-14). */
    prospectMobile?: string | null;
    prospectBirthDate?: string | null;
    prospectJobTitle?: string | null;
    prospectCivility?: string | null;
  };
  /** Slot rendu juste après le bloc "Entreprise référencée" et avant
   *  les pickers Session/Parcours. Utilisé pour le bloc Référents
   *  pédagogiques (R6 — Gilles 2026-05-13) qui dépend de l'entreprise
   *  sélectionnée. */
  referentsSlot?: React.ReactNode;
};

/**
 * Combobox générique : champ texte + suggestions filtrées en dropdown.
 * Si `onCreateNew` est fourni, propose en bas du dropdown un bouton
 * pour créer un nouvel élément à partir du texte tapé.
 */
function SearchableCombobox<T>({
  value,
  onChange,
  query,
  setQuery,
  options,
  filterFn,
  renderOption,
  placeholder,
  selectedLabel,
  emptyText,
  onPick,
  icon: Icon,
  onCreateNew,
  createNewLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  query: string;
  setQuery: (v: string) => void;
  options: T[];
  filterFn: (opt: T, q: string) => boolean;
  renderOption: (opt: T) => React.ReactNode;
  placeholder: string;
  selectedLabel: string | null;
  emptyText: string;
  onPick: (opt: T) => void;
  icon: typeof User;
  onCreateNew?: (typedText: string) => void;
  createNewLabel?: (typedText: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return options.slice(0, 30);
    const q = query.toLowerCase();
    return options.filter((o) => filterFn(o, q)).slice(0, 30);
  }, [options, query, filterFn]);

  return (
    <div ref={ref} className="relative">
      <div
        data-combobox-filled={value && !open ? "true" : "false"}
        className={cn(
          "flex items-start gap-2 min-h-9 w-full rounded-md border bg-white dark:bg-slate-900 px-3 py-1.5 cursor-text",
          open
            ? "border-cyan-500 ring-1 ring-cyan-500"
            : "border-slate-300 dark:border-slate-700",
        )}
        onClick={() => setOpen(true)}
      >
        <Icon className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        {!open && value ? (
          <span
            className="text-sm flex-1 font-bold leading-snug break-words min-w-0 text-slate-900 dark:text-slate-100"
            title={selectedLabel ?? undefined}
          >
            {selectedLabel}
          </span>
        ) : (
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none"
          />
        )}
        {value && !open && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setQuery("");
            }}
            className="text-xs text-slate-400 hover:text-red-600 shrink-0 mt-0.5"
          >
            ✕
          </button>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 shrink-0 transition-transform mt-0.5",
            open && "rotate-180",
          )}
        />
      </div>

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 italic">
              {emptyText}
            </div>
          ) : (
            <ul>
              {filtered.map((opt, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(opt);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    {renderOption(opt)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Bouton "Créer nouveau" — affiché en bas du dropdown si callback fourni et texte tapé */}
          {onCreateNew && query.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                onCreateNew(query.trim());
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-cyan-50 dark:bg-cyan-950/30 hover:bg-cyan-100 dark:hover:bg-cyan-950/50 text-cyan-800 dark:text-cyan-300 font-semibold text-xs inline-flex items-center gap-1.5"
            >
              <span className="text-lg leading-none">+</span>
              {createNewLabel
                ? createNewLabel(query.trim())
                : `Créer "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TargetPickers({
  learners,
  companies,
  sessions,
  parcoursOptions,
  defaults,
  referentsSlot,
}: Props) {
  // --- États ---
  const [learnerId, setLearnerId] = useState(defaults.learnerId ?? "");
  const [learnerQuery, setLearnerQuery] = useState("");

  const [companyId, setCompanyId] = useState(defaults.companyId ?? "");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyFreetext, setCompanyFreetext] = useState(
    defaults.companyFreetext ?? "",
  );
  // Note (Gilles 2026-05-21) : depuis l'Étape C, la création d'une
  // nouvelle entreprise utilise <CompanyForm fieldPrefix="new_company_" />
  // (même formulaire que le module Entreprises). Les anciens states locaux
  // newCompanySiret/Address/etc. ont été supprimés — CompanyForm gère ses
  // propres champs uncontrolled (defaultValue + DOM via SIRENE).

  const [sessionId, setSessionId] = useState(defaults.sessionId ?? "");
  const [sessionQuery, setSessionQuery] = useState("");
  const [parcoursId, setParcoursId] = useState(defaults.parcoursId ?? "");
  const [parcoursQuery, setParcoursQuery] = useState("");

  // Apprenant initialement rattaché à l'inscription (au moment du
  // mount). Sert de SOURCE de pré-remplissage des coordonnées :
  // - en priorité on prend les overrides locaux `prospect_*` de
  //   l'inscription (modifs antérieures non synchronisées vers le
  //   learner) ;
  // - sinon on prend les valeurs du learner.
  // Avant ce fix, on n'utilisait que les prospect_* → les fiches
  // sauvegardées AVANT la migration 0098 n'avaient pas de prospect_*
  // donc les champs apparaissaient vides à l'écran alors que la
  // table affichait correctement le fallback learner.* (Gilles 2026-05-26).
  const initialLinkedLearner = defaults.learnerId
    ? (learners.find((l) => l.id === defaults.learnerId) ?? null)
    : null;

  // Champs prospect (édition manuelle, mais auto-remplis quand on choisit un apprenant)
  const [firstName, setFirstName] = useState(
    defaults.prospectFirstName ??
      initialLinkedLearner?.first_name ??
      "",
  );
  const [lastName, setLastName] = useState(
    (
      defaults.prospectLastName ??
      initialLinkedLearner?.last_name ??
      ""
    ).toLocaleUpperCase("fr-FR"),
  );
  const [email, setEmail] = useState(
    defaults.prospectEmail ?? initialLinkedLearner?.email ?? "",
  );
  const [phone, setPhone] = useState(
    defaults.prospectPhone ?? initialLinkedLearner?.phone ?? "",
  );
  const [mobile, setMobile] = useState(
    defaults.prospectMobile ?? initialLinkedLearner?.mobile ?? "",
  );
  const [birthDate, setBirthDate] = useState(
    defaults.prospectBirthDate ?? "",
  );
  // Fonction : non stockée sur inscription_requests, vient toujours
  // du learner (sinon ce qui a été saisi pour la fiche).
  const initialJobTitle =
    defaults.prospectJobTitle ?? initialLinkedLearner?.job_title ?? "";
  const [jobTitle, setJobTitle] = useState(initialJobTitle);
  // Civilité : priorité au prospect_* (modif locale), fallback learner.
  const initialCivility =
    defaults.prospectCivility ?? initialLinkedLearner?.civility ?? "";
  const [civility, setCivility] = useState(initialCivility);

  // Snapshot des valeurs INITIALES au mount. Sert à détecter ce que
  // l'utilisateur a réellement modifié DEPUIS l'ouverture de la fiche,
  // au lieu de comparer avec les valeurs du learner (qui peuvent déjà
  // différer si une précédente modif a été enregistrée avec "NON" pour
  // la sync vers le learner). Le bandeau jaune n'apparaît qu'à partir
  // d'une vraie nouvelle modif. Gilles 2026-05-26.
  const initialContactRef = useRef({
    email: defaults.prospectEmail ?? initialLinkedLearner?.email ?? "",
    phone: defaults.prospectPhone ?? initialLinkedLearner?.phone ?? "",
    mobile: defaults.prospectMobile ?? initialLinkedLearner?.mobile ?? "",
    jobTitle: initialJobTitle,
    civility: initialCivility,
    learnerId: defaults.learnerId ?? "",
  });

  // Choix utilisateur : si l'apprenant existe déjà ET que l'utilisateur
  // modifie une coordonnée, doit-on aussi mettre à jour la fiche
  // apprenant dans le module Apprenants ?
  // - "yes"  → on écrase la fiche apprenant (comportement historique)
  // - "no"   → on ne touche pas la fiche apprenant, seule l'inscription
  //            stocke les nouvelles infos (et le tableau les affiche)
  // (Bug Gilles 2026-05-26)
  const [updateLearnerContact, setUpdateLearnerContact] = useState<
    "yes" | "no"
  >("yes");

  // --- Sélections ---
  const selectedLearner = learners.find((l) => l.id === learnerId);
  const selectedCompany = companies.find((c) => c.id === companyId);
  const selectedSession = sessions.find((s) => s.id === sessionId);
  const selectedParcours = parcoursOptions.find((p) => p.id === parcoursId);

  // Détecte si l'utilisateur a modifié au moins une coordonnée
  // DEPUIS L'OUVERTURE DE LA FICHE (= comparaison avec le snapshot
  // initial pris au mount). N'a de sens que si un apprenant existant
  // est sélectionné — pour un nouvel apprenant, pas besoin de demander
  // la sync, il sera créé avec les valeurs saisies.
  // Gilles 2026-05-26 : avant on comparait avec selectedLearner, ce qui
  // déclenchait le bandeau dès l'ouverture si une précédente modif
  // n'avait pas été synchronisée (prospect_* ≠ learner.*).
  function norm(s: string | null | undefined): string {
    return (s ?? "").trim().toLowerCase();
  }
  const hasContactChanges =
    selectedLearner &&
    initialContactRef.current.learnerId === learnerId &&
    (norm(email) !== norm(initialContactRef.current.email) ||
      norm(phone) !== norm(initialContactRef.current.phone) ||
      norm(mobile) !== norm(initialContactRef.current.mobile) ||
      norm(jobTitle) !== norm(initialContactRef.current.jobTitle) ||
      norm(civility) !== norm(initialContactRef.current.civility));

  function pickLearner(l: LearnerOption) {
    setLearnerId(l.id);
    setLearnerQuery("");
    // Auto-remplit les champs prospect (sauf si déjà saisis manuellement)
    if (!firstName) setFirstName(l.first_name ?? "");
    if (!lastName)
      setLastName((l.last_name ?? "").toLocaleUpperCase("fr-FR"));
    if (!email) setEmail(l.email ?? "");
    // 2 champs téléphone distincts (fixe + mobile) depuis la fiche
    // apprenant. Évolution 2026-05-14 : avant on n'avait qu'un seul
    // champ, donc on perdait l'un des deux à l'inscription.
    if (!phone) setPhone(l.phone ?? "");
    if (!mobile) setMobile(l.mobile ?? "");
    if (!jobTitle) setJobTitle(l.job_title ?? "");
    if (!civility) setCivility(l.civility ?? "");
    // Auto-rattachement à l'entreprise de l'apprenant — SAUF si
    // l'utilisateur a déjà sélectionné une entreprise (Étape B
    // Gilles 2026-05-21 : entreprise saisie en premier, on ne
    // l'écrase pas en choisissant un apprenant ensuite).
    if (l.company_id && !companyId && !companyFreetext) {
      setCompanyId(l.company_id);
      setCompanyFreetext("");
    }
    // Réinitialise le snapshot de détection de modif sur les NOUVELLES
    // valeurs du learner choisi. Sans ça, le bandeau "Vous avez modifié…"
    // se déclencherait dès la sélection (state passe des anciennes
    // valeurs aux nouvelles). Gilles 2026-05-26.
    initialContactRef.current = {
      learnerId: l.id,
      email: email || (l.email ?? ""),
      phone: phone || (l.phone ?? ""),
      mobile: mobile || (l.mobile ?? ""),
      jobTitle: jobTitle || (l.job_title ?? ""),
      civility: civility || (l.civility ?? ""),
    };
    setUpdateLearnerContact("yes");
  }

  function pickCompany(c: CompanyOption) {
    setCompanyId(c.id);
    setCompanyQuery("");
    setCompanyFreetext("");
  }

  function pickSession(s: SessionOption) {
    setSessionId(s.id);
    setSessionQuery("");
  }

  function pickParcours(p: { id: string; label: string }) {
    setParcoursId(p.id);
    setParcoursQuery("");
  }

  return (
    <div className="space-y-6">
      {/* ============ ENTREPRISE (Étape B — Gilles 2026-05-21) ============
          Saisie EN PREMIER : l'entreprise conditionne l'apprenant (qui en
          fait partie) et les référents pédagogiques. */}
      <div className="rounded-lg bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-4 space-y-3">
        <label className="text-xs font-semibold inline-flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5" />
          Entreprise référencée
          {selectedCompany && selectedLearner?.company_id === companyId && (
            <span className="text-[10px] text-cyan-700 font-bold uppercase tracking-wider">
              ↳ auto depuis l&apos;apprenant
            </span>
          )}
        </label>
        <input type="hidden" name="company_id" value={companyId} />
        <SearchableCombobox<CompanyOption>
          value={companyId}
          onChange={setCompanyId}
          query={companyQuery}
          setQuery={setCompanyQuery}
          options={companies}
          filterFn={(c, q) => c.name.toLowerCase().includes(q)}
          renderOption={(c) => <span className="text-sm">{c.name}</span>}
          placeholder="Rechercher une entreprise existante…"
          selectedLabel={
            selectedCompany?.name ??
            (companyFreetext ? `${companyFreetext} (à créer)` : null)
          }
          emptyText="Aucune entreprise trouvée. Tapez le nom complet pour la créer."
          onPick={pickCompany}
          icon={Building2}
          onCreateNew={(typed) => {
            setCompanyId("");
            setCompanyFreetext(typed);
            setCompanyQuery("");
          }}
          createNewLabel={(typed) =>
            `Créer « ${typed} » comme nouvelle entreprise`
          }
        />
        {companyFreetext && !companyId && (
          <div className="rounded-md bg-cyan-50/60 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900 p-4 space-y-3">
            {/* Bandeau + bouton Annuler */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-cyan-800 dark:text-cyan-300 inline-flex items-center gap-1.5">
                <span className="text-base leading-none">+</span>
                <span>
                  <strong>{companyFreetext}</strong> sera créée dans le module
                  Entreprises
                </span>
              </p>
              <button
                type="button"
                onClick={() => setCompanyFreetext("")}
                className="text-cyan-600 hover:text-red-600 underline text-[11px]"
              >
                Annuler
              </button>
            </div>

            {/* Fiche entreprise COMPLÈTE embarquée — même formulaire que
                le module ENTREPRISES & CONTACTS (Gilles 2026-05-21).
                Tous les champs sont préfixés `new_company_` pour ne pas
                entrer en collision avec les autres champs de l'inscription.
                resolveCompanyId côté serveur lit ces champs préfixés. */}
            <CompanyForm
              fieldPrefix="new_company_"
              initialValues={{ name: companyFreetext }}
            />
          </div>
        )}
        {/* Champ caché : nom libre toujours envoyé en fallback si
            CompanyForm n'a pas été monté (cas legacy). resolveCompanyId
            lit prioritairement new_company_name. */}
        <input
          type="hidden"
          name="company_name_freetext"
          value={companyFreetext}
        />
      </div>

      {/* ============ APPRENANT ============ */}
      <div className="rounded-lg bg-cyan-50/40 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-4 space-y-3">
        <label className="text-xs font-semibold inline-flex items-center gap-2">
          Apprenant existant
          <span className="text-slate-500 font-normal">
            (recherche par nom, prénom, email, société…)
          </span>
        </label>
        <input type="hidden" name="learner_id" value={learnerId} />
        <SearchableCombobox<LearnerOption>
          value={learnerId}
          onChange={setLearnerId}
          query={learnerQuery}
          setQuery={setLearnerQuery}
          options={learners}
          filterFn={(l, q) => {
            const txt = [
              l.first_name ?? "",
              l.last_name,
              l.email ?? "",
              l.company_name ?? "",
              l.job_title ?? "",
            ]
              .join(" ")
              .toLowerCase();
            return txt.includes(q);
          }}
          renderOption={(l) => (
            <div>
              <p className="text-sm font-semibold">
                {l.last_name.toUpperCase()}{" "}
                {l.first_name && (
                  <span className="font-normal">{l.first_name}</span>
                )}
              </p>
              <p className="text-[11px] text-slate-500 flex flex-wrap gap-x-2">
                {l.company_name && (
                  <span className="inline-flex items-center gap-0.5">
                    <Building2 className="h-3 w-3" />
                    {l.company_name}
                  </span>
                )}
                {l.email && <span>{l.email}</span>}
              </p>
            </div>
          )}
          placeholder="Tapez pour rechercher (ou laissez vide pour saisir un nouveau prospect)…"
          selectedLabel={
            selectedLearner
              ? `${selectedLearner.last_name.toUpperCase()} ${selectedLearner.first_name ?? ""}${
                  selectedLearner.company_name
                    ? ` · ${selectedLearner.company_name}`
                    : ""
                }`
              : null
          }
          emptyText="Aucun apprenant trouvé. Vous pouvez en créer un en remplissant les champs ci-dessous."
          onPick={pickLearner}
          icon={User}
        />
        <p className="text-[11px] text-slate-500">
          💡 Si vous laissez vide, un apprenant sera créé automatiquement
          depuis les informations ci-dessous.
        </p>
      </div>

      {/* Champs prospect — layout compact 2026-05-14 :
          Ligne 1 : Civilité (auto) + Prénom + Nom
          Ligne 2 : Email FULL WIDTH (pour ne plus le tronquer)
          Ligne 3 : Téléphone fixe + Téléphone mobile (les 2 distincts)
          Ligne 4 : Fonction + Date naissance + Préférence de contact */}

      {/* === Ligne 1 : Identité === */}
      <div className="grid gap-4 md:grid-cols-[auto_1fr_1fr]">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold inline-flex items-center gap-1">
            Civilité
          </label>
          <select
            name="prospect_civility"
            value={civility}
            onChange={(e) => setCivility(e.target.value)}
            data-filled={civility ? "true" : "false"}
            className="flex h-9 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
            title="M. / Mme / Autre — sera repris sur la fiche apprenant"
          >
            <option value="">—</option>
            <option value="M.">M.</option>
            <option value="Mme">Mme</option>
            <option value="Autre">Autre</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold inline-flex items-center gap-1">
            Prénom <span className="text-red-600 font-bold">*</span>
          </label>
          <input
            name="prospect_first_name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder=" "
            className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold inline-flex items-center gap-1">
            Nom <span className="text-red-600 font-bold">*</span>
          </label>
          <input
            name="prospect_last_name"
            required
            value={lastName}
            onChange={(e) =>
              setLastName(e.target.value.toLocaleUpperCase("fr-FR"))
            }
            placeholder=" "
            className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 uppercase"
          />
        </div>
      </div>

      {/* === Info coordonnées + choix de propagation === */}
      {/* Hidden : envoyé au serveur pour décider si l'on met à jour
          la fiche apprenant ou pas. */}
      <input
        type="hidden"
        name="update_learner_contact"
        value={updateLearnerContact}
      />
      {hasContactChanges ? (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-900 px-3 py-2.5 space-y-2">
          <p className="text-xs text-amber-900 dark:text-amber-200 font-semibold">
            ⚠ Vous avez modifié les coordonnées de l&apos;apprenant{" "}
            {selectedLearner?.first_name} {selectedLearner?.last_name}.
          </p>
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            Souhaitez-vous mettre à jour aussi la fiche apprenant dans le
            module Apprenants ?
          </p>
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={updateLearnerContact === "yes"}
                onChange={() => setUpdateLearnerContact("yes")}
                className="h-3.5 w-3.5"
              />
              <span className="font-medium">
                OUI, mettre à jour la fiche apprenant
              </span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                checked={updateLearnerContact === "no"}
                onChange={() => setUpdateLearnerContact("no")}
                className="h-3.5 w-3.5"
              />
              <span className="font-medium">
                NON, uniquement sur cette inscription
              </span>
            </label>
          </div>
          {updateLearnerContact === "no" && (
            <p className="text-[10px] text-amber-700 italic">
              Les nouvelles coordonnées seront enregistrées sur cette
              inscription uniquement — la fiche apprenant garde ses
              valeurs précédentes.
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500 italic bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-md px-3 py-2">
          💡 <strong>Bon à savoir</strong> : si vous modifiez les
          coordonnées d&apos;un apprenant existant, une question
          apparaîtra pour savoir si la fiche apprenant doit être mise à
          jour ou non.
        </p>
      )}

      {/* === Ligne 2 : Email seul, pleine largeur === */}
      <div className="space-y-1.5">
        <label className="text-xs">Email</label>
        <input
          name="prospect_email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder=" "
          className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm"
        />
      </div>

      {/* === Ligne 3 : Téléphone fixe + Téléphone mobile === */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs">Téléphone fixe</label>
          {/* PhoneInput est uncontrolled (initialise depuis defaultValue
              une seule fois). La `key` change à chaque changement
              d'apprenant pour forcer le remount avec la bonne valeur. */}
          <PhoneInput
            key={`phone-${learnerId || "new"}`}
            name="prospect_phone"
            defaultValue={phone}
            onValueChange={setPhone}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs">Téléphone mobile</label>
          <PhoneInput
            key={`mobile-${learnerId || "new"}`}
            name="prospect_mobile"
            defaultValue={mobile}
            onValueChange={setMobile}
          />
        </div>
      </div>

      {/* === Ligne 4 : Fonction + Date de naissance + Préférence === */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-xs">Fonction</label>
          <input
            name="prospect_job_title"
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Ex: Conducteur de travaux…"
            className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs">Date de naissance</label>
          <input
            name="prospect_birth_date"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            data-filled={birthDate ? "true" : "false"}
            className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs">Préférence de contact</label>
          <select
            name="contact_preference"
            defaultValue="email"
            className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm"
          >
            <option value="email">Email</option>
            <option value="phone">Téléphone</option>
            <option value="sms">SMS</option>
          </select>
        </div>
      </div>

      {/* === Référents pédagogiques (R6 — Gilles 2026-05-13) ===
          Slot inséré entre l'Apprenant et la cible (Session/Parcours)
          parce que les référents dépendent de l'entreprise sélectionnée
          (qui est désormais saisie tout en haut). */}
      {referentsSlot}

      {/* ============ SESSION / PARCOURS ============ */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Session
          </label>
          <input
            type="hidden"
            name="target_session_id"
            value={sessionId}
          />
          <SearchableCombobox<SessionOption>
            value={sessionId}
            onChange={setSessionId}
            query={sessionQuery}
            setQuery={setSessionQuery}
            options={sessions}
            filterFn={(s, q) =>
              `${s.label} ${s.meta ?? ""} ${s.modality ?? ""}`
                .toLowerCase()
                .includes(q)
            }
            renderOption={(s) => (
              <div>
                <p className="text-sm font-semibold">{s.label}</p>
                {s.meta && (
                  <p className="text-[11px] text-slate-500">{s.meta}</p>
                )}
              </div>
            )}
            placeholder="Rechercher par formation, date, lieu…"
            selectedLabel={
              selectedSession
                ? selectedSession.label +
                  (selectedSession.meta ? ` · ${selectedSession.meta}` : "")
                : null
            }
            emptyText="Aucune session trouvée."
            onPick={pickSession}
            icon={Calendar}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Parcours
          </label>
          <input
            type="hidden"
            name="target_parcours_id"
            value={parcoursId}
          />
          <SearchableCombobox<{ id: string; label: string }>
            value={parcoursId}
            onChange={setParcoursId}
            query={parcoursQuery}
            setQuery={setParcoursQuery}
            options={parcoursOptions}
            filterFn={(p, q) => p.label.toLowerCase().includes(q)}
            renderOption={(p) => <span className="text-sm">{p.label}</span>}
            placeholder="Rechercher un parcours…"
            selectedLabel={selectedParcours?.label ?? null}
            emptyText="Aucun parcours."
            onPick={pickParcours}
            icon={Calendar}
          />
        </div>
      </div>

      {/* Confirmation visuelle quand session + apprenant sont sélectionnés */}
      {selectedSession && (selectedLearner || (firstName && lastName)) && (
        <div className="rounded-lg bg-cyan-50 border border-cyan-200 px-4 py-2.5 text-xs text-cyan-800 inline-flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>
            <strong>
              {selectedLearner
                ? `${selectedLearner.last_name.toUpperCase()} ${selectedLearner.first_name ?? ""}`
                : `${lastName.toUpperCase()} ${firstName}`}
            </strong>{" "}
            sera inscrit(e) à la session{" "}
            <strong>{selectedSession.label}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
