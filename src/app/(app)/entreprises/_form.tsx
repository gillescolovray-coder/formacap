"use client";

import { useState } from "react";
import {
  AtSign,
  Building2,
  ExternalLink,
  GitBranch,
  Globe,
  Hash,
  IdCard,
  MapPin,
  Phone,
  Phone as PhoneIcon,
  Tag,
  Type,
  Users,
} from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { PostalCodeCity } from "@/components/postal-code-city";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import type { Company } from "@/lib/companies/types";
import { COMPANY_TYPE_LABELS } from "@/lib/companies/types";
import {
  SIRENE_STATUS_BADGE_CLASSES,
  SIRENE_STATUS_LABELS,
  type SireneLegalStatus,
} from "@/lib/sirene/types";
import { cn } from "@/lib/utils";
import { AutoSyncBadge } from "@/components/auto-sync-badge";
import { ContactsBuilder } from "./_contacts-builder";
import { CompanyGpsSection } from "./_gps-section";
import { SireneLookup } from "./_sirene-lookup";

type CompanyFormProps = {
  company?: Company;
  /** Mode "création" : on peut ajouter des contacts inline. */
  withContactsBuilder?: boolean;
  /** Slot inséré dans le bloc Identité, juste sous « N° Déclaration
   *  d'Activité » et au-dessus de « Relation commerciale ». Utilisé pour
   *  intégrer le picker « Société mère / filiale » en édition. Ignoré en
   *  mode création (la société n'existe pas encore en BDD). */
  hierarchySlot?: React.ReactNode;
};

export function CompanyForm({
  company,
  withContactsBuilder = false,
  hierarchySlot,
}: CompanyFormProps) {
  const status = (company?.legal_status ?? null) as SireneLegalStatus | null;
  // Type de relation commerciale en state — la zone NDA n'est visible que
  // si le type courant est « of » (Organisme de formation).
  const [companyType, setCompanyType] = useState<string>(
    company?.type ?? "prospect",
  );
  return (
    <div className="space-y-4">
      {/* Auto-remplissage INSEE Sirene (mode création uniquement) */}
      {!company && (
        <>
          <SireneLookup initialQuery="" />
          <div className="flex items-center gap-2 -mt-1">
            <AutoSyncBadge
              title="Auto-remplissage INSEE Sirene"
              rules={[
                {
                  field: "Raison sociale",
                  target: "Identité",
                  condition: "Récupérée depuis le registre INSEE.",
                },
                {
                  field: "SIREN / SIRET",
                  target: "Identité",
                  condition: "Lien Pappers généré automatiquement.",
                },
                {
                  field: "Forme juridique",
                  target: "Identité",
                  condition: "Renseignée selon les données INSEE.",
                },
                {
                  field: "Code NAF / APE",
                  target: "Secteur",
                  condition: "Renseigné selon l'activité déclarée.",
                },
                {
                  field: "État SIRENE (active / cessée)",
                  target: "Identité",
                  condition: "Mis à jour selon le statut légal.",
                },
                {
                  field: "Adresse du siège",
                  target: "Adresse",
                  condition: "Code postal, ville et adresse pré-remplis.",
                },
                {
                  field: "Dirigeants",
                  target: "Contacts",
                  condition:
                    "Proposés en un clic depuis la liste retournée par Sirene.",
                },
              ]}
              footnote={
                <>
                  Si vous ne souhaitez pas utiliser Sirene, remplissez
                  manuellement les champs ci-dessous — rien n&apos;est
                  obligatoire à part la raison sociale.
                </>
              }
            />
          </div>
        </>
      )}

      {/* 1 — Identification — style Catalogue : cartes colorées par champ */}
      <CollapsibleSection
        icon={IdCard}
        title="Identification"
        description="Raison sociale et informations légales."
        accent="emerald"
        defaultOpen
        id="identification"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {/* Relation commerciale — placée EN PREMIER : c'est elle qui
              conditionne l'affichage du NDA (visible uniquement si type
              = OF) et la lecture rapide de la fiche. */}
          <div className="md:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-3.5 space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Relation commerciale
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="type" required>
                  Type
                </Label>
                <select
                  id="type"
                  name="type"
                  value={companyType}
                  onChange={(e) => setCompanyType(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-zinc-900 px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500"
                >
                  {Object.entries(COMPANY_TYPE_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead_source">Origine du contact</Label>
                <Input
                  id="lead_source"
                  name="lead_source"
                  defaultValue={company?.lead_source ?? ""}
                  placeholder="Site web, Recommandation…"
                  className="bg-white dark:bg-zinc-900"
                />
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                id="is_active"
                name="is_active"
                type="checkbox"
                defaultChecked={company ? company.is_active : true}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <span className="text-zinc-700 dark:text-zinc-300">
                Entreprise active
              </span>
            </label>
          </div>

          {/* Hero : Raison sociale en grand, mise en avant */}
          <div className="md:col-span-2 rounded-xl border-2 border-cyan-400 dark:border-cyan-600 bg-cyan-50 dark:bg-cyan-950/30 p-3.5 space-y-2 shadow-sm shadow-cyan-200/50 dark:shadow-cyan-950/30">
            <Label
              htmlFor="name"
              className="flex items-center gap-2 text-sm font-bold text-cyan-800 dark:text-cyan-200"
            >
              <Type className="h-4 w-4" />
              Raison sociale
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 ring-1 ring-red-200 dark:ring-red-900">
                <span className="text-red-600 dark:text-red-400">*</span>
                Obligatoire
              </span>
            </Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={company?.name ?? ""}
              placeholder="Ex: Acme SAS"
              className="bg-white dark:bg-zinc-900 font-semibold border-cyan-300 dark:border-cyan-800 focus-visible:ring-cyan-500"
            />
          </div>

          {/* Forme juridique */}
          <div className="rounded-xl border border-teal-200 dark:border-teal-900/50 bg-teal-50/50 dark:bg-teal-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="legal_form"
              className="flex items-center gap-2 text-sm font-semibold text-teal-700 dark:text-teal-300"
            >
              <Building2 className="h-4 w-4" />
              Forme juridique
            </Label>
            <Input
              id="legal_form"
              name="legal_form"
              defaultValue={company?.legal_form ?? ""}
              placeholder="SAS, SARL, SA…"
              className="bg-white dark:bg-zinc-900"
            />
          </div>

          {/* SIREN */}
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="siren"
              className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
            >
              <Hash className="h-4 w-4" />
              SIREN
            </Label>
            <Input
              id="siren"
              name="siren"
              defaultValue={company?.siren ?? ""}
              placeholder="9 chiffres"
              className="bg-white dark:bg-zinc-900 font-mono"
            />
          </div>

          {/* SIRET */}
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="siret"
              className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
            >
              <Hash className="h-4 w-4" />
              SIRET
            </Label>
            <Input
              id="siret"
              name="siret"
              defaultValue={company?.siret ?? ""}
              placeholder="14 chiffres"
              className="bg-white dark:bg-zinc-900 font-mono"
            />
          </div>

          {/* Secteur d'activité */}
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="industry"
              className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"
            >
              <Tag className="h-4 w-4" />
              Secteur d&apos;activité
            </Label>
            <Input
              id="industry"
              name="industry"
              defaultValue={company?.industry ?? ""}
              placeholder="BTP, Commerce…"
              className="bg-white dark:bg-zinc-900"
            />
          </div>

          {/* Code NAF/APE */}
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="naf_code"
              className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"
            >
              <Hash className="h-4 w-4" />
              Code NAF / APE
            </Label>
            <Input
              id="naf_code"
              name="naf_code"
              defaultValue={company?.naf_code ?? ""}
              placeholder="6201Z"
              className="bg-white dark:bg-zinc-900 font-mono"
            />
          </div>

          {/* Lien Pappers — placé directement après le code NAF pour
              regrouper visuellement les infos liées à l'identité légale
              et au registre du commerce. */}
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/50 dark:bg-cyan-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="pappers_url"
              className="flex items-center gap-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300"
            >
              <ExternalLink className="h-4 w-4" />
              Lien Pappers
              <span className="ml-1 text-[10px] font-normal text-cyan-500/80">
                (auto-rempli SIRENE)
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="pappers_url"
                name="pappers_url"
                type="url"
                defaultValue={company?.pappers_url ?? ""}
                placeholder="https://www.pappers.fr/entreprise/…"
                className="bg-white dark:bg-zinc-900"
              />
              {company?.pappers_url && (
                <a
                  href={company.pappers_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Consulter la fiche Pappers dans un nouvel onglet"
                  className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-cyan-300 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-colors shrink-0"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* État officiel SIRENE */}
          <div className="md:col-span-2 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="legal_status"
              className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300"
            >
              <Tag className="h-4 w-4" />
              État officiel SIRENE
            </Label>
            <div className="flex items-center gap-2">
              <select
                id="legal_status"
                name="legal_status"
                defaultValue={company?.legal_status ?? ""}
                className="flex h-9 flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-zinc-900 px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
              >
                <option value="">— Inconnu —</option>
                <option value="A">Active</option>
                <option value="C">Cessée</option>
                <option value="D">Procédure / radiée</option>
              </select>
              {status && (
                <span
                  className={cn(
                    "inline-block px-2 py-1 rounded text-xs font-bold whitespace-nowrap",
                    SIRENE_STATUS_BADGE_CLASSES[status],
                  )}
                >
                  {SIRENE_STATUS_LABELS[status]}
                </span>
              )}
            </div>
          </div>

          {/* N° Déclaration Activité — visible UNIQUEMENT si la
              relation commerciale est « Organisme de formation ».
              Le toggle est piloté par le state `companyType` synchronisé
              avec le sélecteur Type plus bas. */}
          {companyType === "of" ? (
            <div className="rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20 p-3.5 space-y-2">
              <Label
                htmlFor="nda"
                className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300"
              >
                <IdCard className="h-4 w-4" />
                N° Déclaration d&apos;Activité
              </Label>
              <Input
                id="nda"
                name="nda"
                defaultValue={company?.nda ?? ""}
                placeholder="Ex: 84 69 12345 69"
                className="bg-white dark:bg-zinc-900 font-mono"
              />
            </div>
          ) : (
            // Le NDA reste persisté en BDD si la société est repassée
            // sur un autre type (on ne perd pas la donnée). On la
            // soumet via un input hidden.
            <input
              type="hidden"
              name="nda"
              value={company?.nda ?? ""}
            />
          )}

          {/* Slot « Société mère / filiale » — inséré ici en mode édition.
              Wrappé dans un encart violet pour identifier visuellement la
              hiérarchie sans rompre le flux du bloc Identification. */}
          {hierarchySlot && (
            <div className="md:col-span-2 rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20 p-3.5 space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
                <GitBranch className="h-4 w-4" />
                Société mère / filiale
              </p>
              {hierarchySlot}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* 3 — Adresse */}
      <CollapsibleSection
        icon={MapPin}
        title="Adresse"
        description="Siège social ou adresse principale."
        accent="rose"
        id="adresse"
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="address">Adresse</Label>
            <Input
              id="address"
              name="address"
              defaultValue={company?.address ?? ""}
              placeholder="Numéro, rue, complément…"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <PostalCodeCity
              postalCodeName="postal_code"
              cityName="city"
              defaultPostalCode={company?.postal_code ?? ""}
              defaultCity={company?.city ?? ""}
              gridClassName="grid gap-4 grid-cols-[1fr_3fr]"
            />
            <div className="space-y-1.5">
              <Label htmlFor="country">Pays</Label>
              <Input
                id="country"
                name="country"
                defaultValue={company?.country ?? "France"}
              />
            </div>
          </div>

          {/* Coordonnées GPS + carte (calculées depuis l'adresse) */}
          <CompanyGpsSection company={company} />
        </div>
      </CollapsibleSection>

      {/* 4 — Contact général */}
      <CollapsibleSection
        icon={Phone}
        title="Contact général"
        description="Coordonnées de l'entreprise (pas d'une personne)."
        accent="violet"
        id="contact-general"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={company?.email ?? ""}
                placeholder="contact@acme.fr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <PhoneInput
                id="phone"
                name="phone"
                defaultValue={company?.phone ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="website">Site web</Label>
            <Input
              id="website"
              name="website"
              type="url"
              defaultValue={company?.website ?? ""}
              placeholder="https://…"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* 5 — Contacts (création) */}
      {withContactsBuilder && (
        <CollapsibleSection
          icon={Users}
          title="Contacts de l'entreprise"
          description="RH, responsable de service, comptable… Ils recevront les notifications selon leurs préférences."
          accent="emerald"
          defaultOpen
          id="contacts"
        >
          <ContactsBuilder />
        </CollapsibleSection>
      )}

      {/* Notes internes : géré par la timeline horodatée affichée
          au-dessus du formulaire (bloc « Notes internes »). On conserve
          un input caché pour préserver la valeur legacy `notes` et ne pas
          l'écraser au save (les anciennes données restent intactes). */}
      <input
        type="hidden"
        name="notes"
        value={company?.notes ?? ""}
      />
    </div>
  );
}
