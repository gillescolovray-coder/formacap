"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  Sparkles,
  User,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UpperCaseInput } from "@/components/ui/uppercase-input";
import { searchSireneAction } from "@/lib/sirene/actions";
import type { SireneCompany } from "@/lib/sirene/types";
import { parseEmailContent, type ParsedEmail } from "@/lib/email-parser/parse";
import {
  createCompanyAndContactFromEmail,
  findPotentialDuplicates,
  findSireneByEmailDomain,
  type CompanyDuplicate,
} from "./actions";
import { cn } from "@/lib/utils";

type Step = "paste" | "review";

const SAMPLE_EMAIL = `Bonjour,

Suite à notre échange téléphonique, je vous confirme l'intérêt de notre équipe pour votre formation "Marchés publics".

Cordialement,

Marie DUBOIS
Responsable formation
ENTREPRISE EXEMPLE SARL
12 rue de la Paix
75002 Paris
Tél : 01 23 45 67 89
Mobile : 06 12 34 56 78
Email : marie.dubois@entreprise-exemple.com
SIRET : 12345678900012
www.entreprise-exemple.com`;

const MATCH_LABELS: Record<CompanyDuplicate["matchType"], string> = {
  siret: "SIRET identique",
  name_postal: "Même nom + même CP",
  name: "Nom proche",
  domain: "Domaine email",
};

const MATCH_BADGE: Record<CompanyDuplicate["matchType"], string> = {
  siret: "bg-red-100 text-red-800 border-red-300",
  name_postal: "bg-orange-100 text-orange-800 border-orange-300",
  name: "bg-amber-100 text-amber-800 border-amber-300",
  domain: "bg-blue-100 text-blue-800 border-blue-300",
};

export function ImportEmailWizard() {
  const [step, setStep] = useState<Step>("paste");
  const [emailText, setEmailText] = useState("");
  const [parsed, setParsed] = useState<ParsedEmail | null>(null);

  // Etat de recherche/lookup
  const [analyzing, setAnalyzing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Champs éditables après parsing
  const [companyName, setCompanyName] = useState("");
  const [siret, setSiret] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mobile, setMobile] = useState("");

  // Recherche SIRENE manuelle (champ + résultats)
  const [sireneQuery, setSireneQuery] = useState("");
  const [sireneSearching, setSireneSearching] = useState(false);
  const [sireneResults, setSireneResults] = useState<SireneCompany[]>([]);

  // Doublons détectés en BDD + sélection éventuelle
  const [duplicates, setDuplicates] = useState<CompanyDuplicate[]>([]);
  const [duplicatesChecking, setDuplicatesChecking] = useState(false);
  const [selectedExistingCompanyId, setSelectedExistingCompanyId] = useState<
    string | null
  >(null);

  function applySireneCompany(c: SireneCompany) {
    if (c.name) setCompanyName(c.name);
    if (c.siret) setSiret(c.siret);
    if (c.address) setAddress(c.address);
    if (c.postal_code) setPostalCode(c.postal_code);
    if (c.city) setCity(c.city);
    setSireneResults([]);
    setSireneQuery("");
  }

  async function checkDuplicates(args: {
    siret: string;
    name: string;
    postalCode: string;
    email: string;
  }) {
    if (!args.name.trim()) {
      setDuplicates([]);
      return;
    }
    setDuplicatesChecking(true);
    try {
      const list = await findPotentialDuplicates({
        siret: args.siret || null,
        name: args.name,
        postalCode: args.postalCode || null,
        email: args.email || null,
      });
      setDuplicates(list);
    } catch (e) {
      console.error("findPotentialDuplicates error:", e);
    } finally {
      setDuplicatesChecking(false);
    }
  }

  async function handleAnalyze() {
    setErrorMsg(null);
    setAnalyzing(true);
    try {
      const result = parseEmailContent(emailText);
      setParsed(result);
      // Pré-remplir les champs éditables
      setCompanyName(result.companyName ?? "");
      setSiret(result.siret ?? "");
      setAddress(result.address ?? "");
      setPostalCode(result.postalCode ?? "");
      setCity(result.city ?? "");
      setWebsite(result.website ?? "");
      setFirstName(result.firstName ?? "");
      setLastName(result.lastName ?? "");
      setJobTitle(result.jobTitle ?? "");
      setContactEmail(result.email ?? "");
      setPhone(result.phone ?? "");
      setMobile(result.mobile ?? "");
      setStep("review");

      // Lancer en parallèle :
      //   - Recherche SIRENE par domaine d'email (option C)
      //   - Détection des doublons en BDD
      const lookupName = result.companyName ?? "";
      void checkDuplicates({
        siret: result.siret ?? "",
        name: lookupName,
        postalCode: result.postalCode ?? "",
        email: result.email ?? "",
      });

      // Lookup SIRENE par domaine si on n'a pas de société détectée
      if (!result.companyName && result.email) {
        try {
          const fromDomain = await findSireneByEmailDomain(result.email);
          if (fromDomain) {
            // On le propose dans la liste des résultats SIRENE pour
            // que l'utilisateur clique explicitement (au cas où le
            // domaine ne corresponde pas à l'entreprise réelle).
            setSireneResults([fromDomain]);
          }
        } catch (e) {
          console.error("findSireneByEmailDomain error:", e);
        }
      }
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSireneSearch() {
    const q = sireneQuery.trim();
    if (q.length < 2) return;
    setSireneSearching(true);
    setErrorMsg(null);
    try {
      const res = await searchSireneAction(q);
      if (!res.ok) {
        setErrorMsg(`Recherche SIRENE échouée : ${res.error}`);
        return;
      }
      setSireneResults(res.results);
    } finally {
      setSireneSearching(false);
    }
  }

  async function handleEnrich() {
    if (!companyName.trim() && !siret.trim()) return;
    setErrorMsg(null);
    setEnriching(true);
    try {
      const query = siret.trim() || companyName.trim();
      const res = await searchSireneAction(query);
      if (!res.ok) {
        setErrorMsg(`Recherche SIRENE échouée : ${res.error}`);
        return;
      }
      if (res.results.length === 0) {
        setErrorMsg("Aucune entreprise trouvée. Vérifiez le nom ou le SIRET.");
        return;
      }
      const c = res.results[0];
      if (!siret && c.siret) setSiret(c.siret);
      if (!address && c.address) setAddress(c.address);
      if (!postalCode && c.postal_code) setPostalCode(c.postal_code);
      if (!city && c.city) setCity(c.city);
    } finally {
      setEnriching(false);
    }
  }

  // Re-vérifier les doublons quand l'utilisateur édite les champs clés
  // (debounce simple : on laisse l'utilisateur cliquer sur "Vérifier les
  // doublons" pour relancer)
  function handleRecheckDuplicates() {
    void checkDuplicates({
      siret,
      name: companyName,
      postalCode,
      email: contactEmail,
    });
  }

  function handleSubmit() {
    setErrorMsg(null);
    if (!selectedExistingCompanyId && !companyName.trim()) {
      setErrorMsg("Le nom de l'entreprise est obligatoire.");
      return;
    }
    if (!lastName.trim()) {
      setErrorMsg("Le nom du contact est obligatoire.");
      return;
    }
    setSubmitting(true);
    startTransition(async () => {
      try {
        await createCompanyAndContactFromEmail({
          existingCompanyId: selectedExistingCompanyId,
          companyName,
          siret: siret || null,
          address: address || null,
          postalCode: postalCode || null,
          city: city || null,
          website: website || null,
          firstName: firstName || null,
          lastName,
          jobTitle: jobTitle || null,
          email: contactEmail || null,
          phone: phone || null,
          mobile: mobile || null,
        });
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Erreur création");
        setSubmitting(false);
      }
    });
  }

  function reset() {
    setStep("paste");
    setParsed(null);
    setErrorMsg(null);
    setSireneResults([]);
    setSireneQuery("");
    setDuplicates([]);
    setSelectedExistingCompanyId(null);
  }

  // ==========================================================
  // RENDU — étape "paste"
  // ==========================================================
  if (step === "paste") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-cyan-700 dark:text-cyan-400 shrink-0 mt-0.5" />
          <div className="text-sm text-cyan-900 dark:text-cyan-200 leading-relaxed">
            <p className="font-bold mb-1">Comment ça marche ?</p>
            <ol className="list-decimal list-inside space-y-0.5 text-xs">
              <li>
                Ouvre le mail dans Gmail, sélectionne tout le contenu
                (signature comprise) et copie-le (<strong>Ctrl+A</strong>{" "}
                puis <strong>Ctrl+C</strong>)
              </li>
              <li>Colle-le ci-dessous (<strong>Ctrl+V</strong>)</li>
              <li>
                Clique sur <strong>Analyser</strong>
              </li>
              <li>
                Si la signature est en image (logo), tape directement le nom
                de l&apos;entreprise dans le champ de recherche SIRENE à
                l&apos;étape suivante.
              </li>
            </ol>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="email-text">Contenu du mail</Label>
            <button
              type="button"
              onClick={() => setEmailText(SAMPLE_EMAIL)}
              className="text-xs text-zinc-500 hover:text-zinc-900 underline"
            >
              Coller un exemple pour tester
            </button>
          </div>
          <Textarea
            id="email-text"
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            rows={14}
            placeholder="Colle ici tout le contenu de l'email (Ctrl+V)…"
            className="font-mono text-xs"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            onClick={handleAnalyze}
            disabled={!emailText.trim() || analyzing}
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Analyser
          </Button>
        </div>
      </div>
    );
  }

  // ==========================================================
  // RENDU — étape "review"
  // ==========================================================
  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3 flex items-start gap-2.5">
        <Check className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
          <strong>Analyse terminée.</strong> Si l&apos;entreprise n&apos;a
          pas été détectée (signature image), utilisez la{" "}
          <strong>recherche SIRENE</strong> juste en dessous pour la
          retrouver et pré-remplir tous les champs.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* ============== Bandeau DOUBLONS détectés ============== */}
      {duplicates.length > 0 && (
        <section
          className={cn(
            "rounded-xl border-2 p-5 space-y-3",
            selectedExistingCompanyId
              ? "bg-emerald-50 border-emerald-300"
              : "bg-orange-50 border-orange-300",
          )}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={cn(
                "h-5 w-5",
                selectedExistingCompanyId
                  ? "text-emerald-700"
                  : "text-orange-700",
              )}
            />
            <h3 className="text-sm font-bold">
              {selectedExistingCompanyId
                ? "Entreprise existante sélectionnée"
                : `${duplicates.length} entreprise${duplicates.length > 1 ? "s" : ""} similaire${duplicates.length > 1 ? "s" : ""} détectée${duplicates.length > 1 ? "s" : ""} dans votre base`}
            </h3>
          </div>
          {!selectedExistingCompanyId && (
            <p className="text-xs text-orange-900 leading-relaxed">
              Pour éviter un doublon, vous pouvez{" "}
              <strong>rattacher le contact</strong> à une de ces
              entreprises. Sinon, continuez la création — vous pouvez
              toujours fusionner plus tard depuis Paramètres.
            </p>
          )}
          <ul className="space-y-2">
            {duplicates.map((d) => {
              const isSelected = selectedExistingCompanyId === d.id;
              return (
                <li
                  key={d.id}
                  className={cn(
                    "rounded-lg border bg-white p-3 transition-colors",
                    isSelected
                      ? "border-emerald-500 ring-2 ring-emerald-200"
                      : "border-zinc-200",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm">{d.name}</span>
                        <span
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                            MATCH_BADGE[d.matchType],
                          )}
                        >
                          {MATCH_LABELS[d.matchType]}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {d.siret ? `SIRET ${d.siret} · ` : ""}
                        {[d.postal_code, d.city].filter(Boolean).join(" ")}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {d.contactsCount} contact
                        {d.contactsCount > 1 ? "s" : ""} ·{" "}
                        {d.enrollmentsCount} apprenant
                        {d.enrollmentsCount > 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() =>
                          setSelectedExistingCompanyId(
                            isSelected ? null : d.id,
                          )
                        }
                      >
                        {isSelected ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Sélectionnée
                          </>
                        ) : (
                          <>Rattacher le contact</>
                        )}
                      </Button>
                      <Link
                        href={`/entreprises/${d.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-zinc-500 hover:text-zinc-900 underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Voir la fiche
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {selectedExistingCompanyId && (
            <div className="text-xs text-emerald-900 bg-emerald-100 rounded p-2.5">
              ✓ Le contact sera <strong>rattaché à cette entreprise
              existante</strong>. Aucun doublon ne sera créé. Les champs
              entreprise ci-dessous sont ignorés.
            </div>
          )}
        </section>
      )}
      {duplicatesChecking && duplicates.length === 0 && (
        <p className="text-xs text-zinc-400 italic">
          Recherche de doublons en cours…
        </p>
      )}

      {/* ============== Recherche SIRENE manuelle ============== */}
      {!selectedExistingCompanyId && (
        <section className="rounded-xl bg-blue-50/40 border border-blue-200 p-5 space-y-3">
          <div className="flex items-start gap-2">
            <Search className="h-4 w-4 text-blue-700 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-blue-900">
                Recherche SIRENE
              </h3>
              <p className="text-xs text-blue-900/80 mt-0.5">
                Si la signature de l&apos;email contient le nom dans une
                image (logo), tapez ici le nom de l&apos;entreprise tel que
                vous le voyez. L&apos;app récupèrera automatiquement le
                SIRET, l&apos;adresse, le code postal et la ville.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={sireneQuery}
              onChange={(e) => setSireneQuery(e.target.value)}
              placeholder="Tapez le nom de l'entreprise (ex: DUPONT BTP)…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSireneSearch();
                }
              }}
            />
            <Button
              type="button"
              onClick={handleSireneSearch}
              disabled={sireneSearching || sireneQuery.trim().length < 2}
            >
              {sireneSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Chercher
            </Button>
          </div>
          {sireneResults.length > 0 && (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {sireneResults.map((c) => (
                <li
                  key={`${c.siren}-${c.siret ?? c.siren}`}
                  className="rounded-md border border-zinc-200 bg-white p-3 hover:border-blue-400 hover:bg-blue-50/40 transition-colors cursor-pointer"
                  onClick={() => applySireneCompany(c)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm">{c.name}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {c.siret ? `SIRET ${c.siret} · ` : ""}
                        {[c.postal_code, c.city].filter(Boolean).join(" ")}
                      </div>
                      {c.industry && (
                        <div className="text-xs text-zinc-400 mt-0.5 italic">
                          {c.industry}
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap",
                        c.legal_status === "A"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : "bg-zinc-100 text-zinc-600 border-zinc-300",
                      )}
                    >
                      {c.legal_status_label}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ============== Bloc Entreprise (édition) ============== */}
      {!selectedExistingCompanyId && (
        <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-cyan-700" />
              Entreprise (à créer)
            </h3>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRecheckDuplicates}
                disabled={duplicatesChecking || !companyName.trim()}
              >
                {duplicatesChecking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                Vérifier doublons
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleEnrich}
                disabled={enriching || (!companyName.trim() && !siret.trim())}
              >
                {enriching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Compléter SIRENE
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="companyName">
                Nom de l&apos;entreprise <span className="text-red-600">*</span>
              </Label>
              <UpperCaseInput
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="ENTREPRISE EXEMPLE SARL"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="siret">SIRET</Label>
              <Input
                id="siret"
                value={siret}
                onChange={(e) => setSiret(e.target.value)}
                placeholder="12345678900012"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">Site web</Label>
              <Input
                id="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://exemple.com"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="address">Adresse</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="12 rue de la Paix"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="postalCode">Code postal</Label>
              <Input
                id="postalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="75002"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Ville</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Paris"
              />
            </div>
          </div>
        </section>
      )}

      {/* ============== Bloc Contact ============== */}
      <section className="rounded-xl bg-white border border-zinc-200 p-5 space-y-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <User className="h-4 w-4 text-violet-700" />
          Contact
          {selectedExistingCompanyId && (
            <span className="text-xs font-normal text-emerald-700 italic">
              (sera rattaché à l&apos;entreprise sélectionnée ci-dessus)
            </span>
          )}
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">Prénom</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Marie"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">
              Nom <span className="text-red-600">*</span>
            </Label>
            <UpperCaseInput
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="DUBOIS"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="jobTitle">Fonction</Label>
            <Input
              id="jobTitle"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Responsable formation"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="contactEmail" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Email
            </Label>
            <Input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="prenom.nom@exemple.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              Téléphone fixe
            </Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01 23 45 67 89"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mobile" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              Mobile
            </Label>
            <Input
              id="mobile"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="06 12 34 56 78"
            />
          </div>
        </div>
      </section>

      {/* Stats détection */}
      {parsed && (
        <div className="text-xs text-zinc-500 px-1">
          Éléments détectés automatiquement par parsing texte :{" "}
          {[
            parsed.email && "email",
            parsed.phone && "tél fixe",
            parsed.mobile && "mobile",
            parsed.firstName && parsed.lastName && "nom",
            parsed.jobTitle && "fonction",
            parsed.companyName && "société",
            parsed.siret && "SIRET",
            parsed.address && "adresse",
            parsed.postalCode && parsed.city && "CP+ville",
            parsed.website && "site web",
          ]
            .filter(Boolean)
            .join(" · ") || "aucun"}
        </div>
      )}

      <div className="flex justify-between gap-2 pt-3 border-t border-zinc-200">
        <Button type="button" variant="outline" onClick={reset}>
          ← Recommencer
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              submitting ||
              !lastName.trim() ||
              (!selectedExistingCompanyId && !companyName.trim())
            }
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {selectedExistingCompanyId
              ? "Rattacher le contact"
              : "Créer entreprise + contact"}
          </Button>
        </div>
      </div>

      {/* Récap visuel des coordonnées détectées */}
      {parsed && parsed.allEmails.length + parsed.allPhones.length > 0 && (
        <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 text-xs text-zinc-600">
          <p className="font-semibold mb-1.5 flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            Tous les contacts trouvés dans l&apos;email :
          </p>
          {parsed.allEmails.length > 0 && (
            <p>
              <strong>Emails :</strong> {parsed.allEmails.join(" · ")}
            </p>
          )}
          {parsed.allPhones.length > 0 && (
            <p>
              <strong>Téléphones :</strong> {parsed.allPhones.join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
