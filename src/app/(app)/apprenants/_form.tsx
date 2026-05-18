import type { ReactNode } from "react";
import {
  Accessibility,
  Briefcase,
  MapPin,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { UpperCaseInput } from "@/components/ui/uppercase-input";
import { Label } from "@/components/ui/label";
import { PostalCodeCity } from "@/components/postal-code-city";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CollapsibleSection } from "@/components/collapsible-section";
import { CompanyPicker } from "./_company-picker";
import type { Learner } from "@/lib/learners/types";
import { CIVILITY_OPTIONS } from "@/lib/learners/types";
import type { Company } from "@/lib/companies/types";

type LearnerFormProps = {
  learner?: Learner;
  companies: Company[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  /** Bloc "Notes internes" (rendu côté serveur) inséré juste avant
   *  l'adresse personnelle. Optionnel : utilisé sur la fiche de
   *  modification, pas sur la création. */
  notesSlot?: ReactNode;
  /** Pré-sélection de l'entreprise lors de la création (ex: création
   *  d'un apprenant depuis la fiche entreprise via
   *  `/apprenants/new?company_id=...`). Ignoré si `learner` est fourni
   *  — la valeur de la fiche existante prime. */
  defaultCompanyId?: string | null;
  /** Si défini, après création l'utilisateur est renvoyé vers la fiche
   *  de cette entreprise (au lieu de la fiche apprenant). Pratique
   *  pour enchaîner la création de plusieurs apprenants depuis une
   *  société. */
  returnToCompanyId?: string | null;
};

export function LearnerForm({
  learner,
  companies,
  action,
  submitLabel,
  notesSlot,
  defaultCompanyId = null,
  returnToCompanyId = null,
}: LearnerFormProps) {
  const effectiveCompanyId = learner?.company_id ?? defaultCompanyId;
  // Règle : un bloc reste ouvert si une info y est déjà renseignée,
  // sinon il est replié pour faciliter la lecture. Le bloc Identité
  // est toujours ouvert (Nom et Prénom sont obligatoires).
  const hasAddressInfo = Boolean(
    learner?.address ||
      learner?.postal_code ||
      learner?.city ||
      (learner?.country && learner.country !== "France"),
  );
  const hasCompanyInfo = Boolean(
    effectiveCompanyId || learner?.job_title,
  );
  const hasSpecialNeeds = Boolean(
    learner?.special_needs || learner?.accessibility,
  );

  return (
    <form id="form-learner" action={action} className="space-y-4">
      {/* Hidden : si défini, l'action redirige vers la fiche société après
          création (au lieu de la fiche apprenant). */}
      {returnToCompanyId && (
        <input
          type="hidden"
          name="return_to_company_id"
          value={returnToCompanyId}
        />
      )}
      {/* Identité & Coordonnées — fusion (toujours ouverte, contient les
          champs obligatoires Nom et Prénom). */}
      <CollapsibleSection
        icon={User}
        title="Identité & Coordonnées"
        description="Civilité, nom, informations personnelles, email et téléphones."
        accent="emerald"
        defaultOpen
        id="identite"
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-1 space-y-2">
              <Label htmlFor="civility">Civilité</Label>
              <Select name="civility" defaultValue={learner?.civility ?? ""}>
                <SelectTrigger id="civility">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {CIVILITY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="first_name">Prénom *</Label>
              <Input
                id="first_name"
                name="first_name"
                required
                defaultValue={learner?.first_name ?? ""}
              />
            </div>
            <div className="md:col-span-3 space-y-2">
              <Label htmlFor="last_name">Nom *</Label>
              <UpperCaseInput
                id="last_name"
                name="last_name"
                required
                defaultValue={learner?.last_name ?? ""}
              />
            </div>
            <div className="md:col-span-6 space-y-2">
              <Label htmlFor="job_title">Fonction / poste</Label>
              <Input
                id="job_title"
                name="job_title"
                defaultValue={learner?.job_title ?? ""}
                placeholder="Ex: Conducteur de travaux, Assistant commercial…"
              />
            </div>
            <div className="md:col-span-3 space-y-2">
              <Label htmlFor="birth_date">Date de naissance</Label>
              <Input
                id="birth_date"
                name="birth_date"
                type="date"
                defaultValue={learner?.birth_date ?? ""}
              />
            </div>
            <div className="md:col-span-3 space-y-2">
              <Label htmlFor="birth_place">Lieu de naissance</Label>
              <Input
                id="birth_place"
                name="birth_place"
                defaultValue={learner?.birth_place ?? ""}
                placeholder="Ville de naissance"
              />
            </div>
          </div>

          {/* Séparateur visuel entre identité et coordonnées */}
          <div className="border-t border-slate-200 dark:border-slate-700" />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={learner?.email ?? ""}
                placeholder="prenom.nom@exemple.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone fixe</Label>
              <PhoneInput
                id="phone"
                name="phone"
                defaultValue={learner?.phone ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile</Label>
              <PhoneInput
                id="mobile"
                name="mobile"
                defaultValue={learner?.mobile ?? ""}
              />
            </div>
          </div>

          {/* Séparateur entre coordonnées et métadonnées */}
          <div className="border-t border-slate-200 dark:border-slate-700" />

          {/* Origine + statut actif */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lead_source">Origine</Label>
              <Input
                id="lead_source"
                name="lead_source"
                defaultValue={learner?.lead_source ?? ""}
                placeholder="Site web, Recommandation…"
              />
            </div>
            <div className="space-y-2">
              <label
                className="flex items-start gap-2 text-sm cursor-pointer"
                title="Coché : l'apprenant apparaît dans les listes d'inscription. Décoché : il est ARCHIVÉ (ne s'affiche plus dans les pickers de nouvelles inscriptions) mais son historique reste accessible. À utiliser à la place de Supprimer quand l'apprenant a déjà participé à des formations."
              >
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={learner ? learner.is_active : true}
                  className="h-4 w-4 mt-0.5 rounded border-zinc-300"
                />
                <span className="flex-1">
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                    Apprenant actif
                  </span>
                  <span className="block text-[11px] text-zinc-500 italic leading-tight mt-0.5">
                    Décocher pour <strong>archiver</strong> : l&apos;apprenant
                    disparaît des listes de sélection mais son historique de
                    formation reste consultable (à utiliser à la place de
                    Supprimer pour les apprenants ayant déjà participé à
                    une session).
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Entreprise (placée AVANT l'adresse — l'utilisateur choisit
          d'abord son rattachement, puis renseigne l'adresse personnelle
          uniquement si c'est un particulier). */}
      <CollapsibleSection
        icon={Briefcase}
        title="Entreprise de rattachement"
        description="Recherchez une entreprise existante ou créez-en une nouvelle (auto-remplissage SIRENE inclus). Laissez vide pour un apprenant particulier et renseigner son adresse personnelle dans le bloc suivant."
        accent="violet"
        defaultOpen={hasCompanyInfo}
        id="entreprise"
      >
        <div className="space-y-2">
          <Label>Entreprise</Label>
          <CompanyPicker
            companies={companies.map((c) => ({
              id: c.id,
              name: c.name,
              postal_code: c.postal_code ?? null,
              city: c.city ?? null,
            }))}
            defaultCompanyId={effectiveCompanyId ?? null}
            defaultCompanyName={
              companies.find((c) => c.id === effectiveCompanyId)?.name ??
              null
            }
          />
        </div>
      </CollapsibleSection>

      {/* Notes internes — rendu côté serveur, inséré ici pour rester
          au contact direct des informations identité/entreprise. */}
      {notesSlot}

      {/* Adresse personnelle */}
      <CollapsibleSection
        icon={MapPin}
        title="Adresse personnelle"
        description="À renseigner pour un apprenant particulier (sans entreprise de rattachement) ou si son adresse personnelle diffère de celle de son entreprise."
        accent="rose"
        defaultOpen={hasAddressInfo}
        id="adresse"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Adresse</Label>
            <Input
              id="address"
              name="address"
              defaultValue={learner?.address ?? ""}
              placeholder="Numéro, rue, complément…"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <PostalCodeCity
              postalCodeName="postal_code"
              cityName="city"
              defaultPostalCode={learner?.postal_code ?? ""}
              defaultCity={learner?.city ?? ""}
              gridClassName="grid gap-4 grid-cols-[1fr_3fr]"
            />
            <div className="space-y-2">
              <Label htmlFor="country">Pays</Label>
              <Input
                id="country"
                name="country"
                defaultValue={learner?.country ?? "France"}
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Qualiopi */}
      <CollapsibleSection
        icon={Accessibility}
        title="Besoins spécifiques (Qualiopi)"
        description="Adaptations pédagogiques à prévoir, le cas échéant."
        accent="amber"
        defaultOpen={hasSpecialNeeds}
        id="qualiopi"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="special_needs">Besoins spécifiques</Label>
            <Textarea
              id="special_needs"
              name="special_needs"
              rows={3}
              defaultValue={learner?.special_needs ?? ""}
              placeholder="Ex: grossesse, dyslexie, prise en compte particulière…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accessibility">Accessibilité handicap</Label>
            <Textarea
              id="accessibility"
              name="accessibility"
              rows={3}
              defaultValue={learner?.accessibility ?? ""}
              placeholder="Ex: accès fauteuil, interprète LSF…"
            />
          </div>
        </div>
      </CollapsibleSection>

      <div className="flex justify-end gap-3 border-t pt-5">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
