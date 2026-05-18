"use client";

import { useState } from "react";
import {
  Award,
  BookOpen,
  Briefcase,
  ClipboardCheck,
  FileText,
  GraduationCap,
  IdCard,
  ShieldCheck,
  Star,
  TrendingUp,
  Upload,
  User,
} from "lucide-react";
import { CollapsibleSection } from "@/components/collapsible-section";
import { PostalCodeCity } from "@/components/postal-code-city";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { UpperCaseInput } from "@/components/ui/uppercase-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PublicsModalitesEditor } from "./_publics-modalites";
import { QualiopiUploadModal } from "./[id]/_qualiopi-upload-modal";
import {
  TRAINER_STATUS_LABELS,
  TRAINER_VALIDATION_STATUS_LABELS,
  type AudienceCatalogItem,
  type ModalityCatalogItem,
  type Trainer,
} from "@/lib/trainers/types";

type TrainerFormProps = {
  trainer?: Trainer;
  audiences?: AudienceCatalogItem[];
  modalities?: ModalityCatalogItem[];
};

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function Select({
  id,
  name,
  defaultValue,
  options,
}: {
  id: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Checkbox({
  name,
  defaultChecked,
  label,
}: {
  name: string;
  defaultChecked?: boolean;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked ?? false}
        className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
      />
      <span>{label}</span>
    </label>
  );
}

function CompanySection({ trainer }: { trainer?: Trainer }) {
  const [sameAddress, setSameAddress] = useState(
    trainer?.company_address_same ?? false,
  );
  const [nda, setNda] = useState(trainer?.nda ?? "");
  const [isQualiopi, setIsQualiopi] = useState(
    trainer?.is_qualiopi ?? false,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const hasNda = nda.trim().length > 0;
  const today = new Date();

  // Source de vérité unique : le certificat Qualiopi le plus récent
  // dans les documents joints du formateur.
  const qualiopiDoc = (trainer?.documents ?? [])
    .filter((d) => d.kind === "qualiopi")
    .sort((a, b) =>
      (b.expires_on ?? "").localeCompare(a.expires_on ?? ""),
    )[0];
  const qualiopiExp = qualiopiDoc?.expires_on
    ? new Date(qualiopiDoc.expires_on)
    : null;
  const qualiopiExpired = qualiopiExp ? qualiopiExp < today : false;
  const hasCertificate = Boolean(qualiopiDoc);

  function handleQualiopiToggle(checked: boolean) {
    setIsQualiopi(checked);
    // Si l'utilisateur coche ET qu'aucun certificat n'est déjà déposé,
    // on ouvre automatiquement la modal d'upload.
    if (checked && !hasCertificate && trainer?.id) {
      setModalOpen(true);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Raison sociale" htmlFor="company_name">
          <Input
            id="company_name"
            name="company_name"
            defaultValue={trainer?.company_name ?? ""}
          />
        </Field>
        <Field label="Forme juridique" htmlFor="legal_form">
          <Input
            id="legal_form"
            name="legal_form"
            defaultValue={trainer?.legal_form ?? ""}
            placeholder="SARL, SAS, EI, micro-entreprise…"
          />
        </Field>
        <Field label="SIRET" htmlFor="siret">
          <Input id="siret" name="siret" defaultValue={trainer?.siret ?? ""} />
        </Field>
        <Field
          label="N° déclaration d'activité (NDA)"
          htmlFor="nda"
          hint="Si le formateur est lui-même OF."
        >
          <Input
            id="nda"
            name="nda"
            value={nda}
            onChange={(e) => setNda(e.target.value)}
          />
        </Field>
      </div>

      {/* Qualiopi : visible dès qu'un NDA est saisi */}
      {hasNda && (
        <div className="rounded-lg bg-violet-50/40 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900 p-4 space-y-3">
          <label className="flex items-start gap-2 text-sm cursor-pointer font-medium">
            <input
              type="checkbox"
              name="is_qualiopi"
              checked={isQualiopi}
              onChange={(e) => handleQualiopiToggle(e.target.checked)}
              className="h-4 w-4 mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <span>
              <span className="inline-flex items-center gap-1.5">
                <Award className="h-4 w-4 text-violet-700 dark:text-violet-400" />
                L&apos;organisme de formation du formateur est certifié{" "}
                <span className="font-bold text-violet-700 dark:text-violet-400">
                  Qualiopi
                </span>
              </span>
            </span>
          </label>

          {isQualiopi && (
            <div className="pl-6 flex flex-wrap items-center gap-3">
              {qualiopiExp ? (
                <>
                  <span
                    className={
                      qualiopiExpired
                        ? "inline-block px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 text-xs font-bold"
                        : "inline-block px-2 py-1 rounded bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 text-xs font-bold"
                    }
                  >
                    {qualiopiExpired ? "⚠ Expiré le " : "✓ Valide jusqu'au "}
                    {qualiopiExp.toLocaleDateString("fr-FR")}
                  </span>
                  <span className="text-xs text-slate-500">
                    Source : certificat dans la section Documents joints
                  </span>
                </>
              ) : (
                <span className="text-xs text-amber-700 dark:text-amber-300">
                  Aucun certificat téléversé.
                </span>
              )}
              {trainer?.id && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setModalOpen(true)}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {hasCertificate
                    ? "Remplacer le certificat"
                    : "Téléverser le certificat"}
                </Button>
              )}
              {!trainer?.id && (
                <span className="text-[11px] text-slate-500">
                  Enregistrez d&apos;abord le formateur pour pouvoir téléverser
                  le certificat.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {trainer?.id && (
        <QualiopiUploadModal
          trainerId={trainer.id}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      )}

      <div className="rounded-lg bg-cyan-50/40 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900 p-4 space-y-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer font-medium">
          <input
            type="checkbox"
            name="company_address_same"
            checked={sameAddress}
            onChange={(e) => setSameAddress(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
          />
          <span>L&apos;adresse de l&apos;entreprise est la même que celle du contact</span>
        </label>

        {!sameAddress && (
          <>
            <div className="grid gap-4 md:grid-cols-[2fr_3fr]">
              <Field label="Adresse entreprise" htmlFor="company_address">
                <Input
                  id="company_address"
                  name="company_address"
                  defaultValue={trainer?.company_address ?? ""}
                />
              </Field>
              <PostalCodeCity
                postalCodeName="company_postal_code"
                cityName="company_city"
                defaultPostalCode={trainer?.company_postal_code ?? ""}
                defaultCity={trainer?.company_city ?? ""}
                gridClassName="grid gap-4 grid-cols-[1fr_3fr]"
              />
            </div>
            <Field label="Pays" htmlFor="company_country">
              <Input
                id="company_country"
                name="company_country"
                defaultValue={trainer?.company_country ?? "France"}
              />
            </Field>
          </>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Téléphone entreprise" htmlFor="company_phone">
            <PhoneInput
              id="company_phone"
              name="company_phone"
              defaultValue={trainer?.company_phone ?? ""}
            />
          </Field>
          <Field label="Email entreprise" htmlFor="company_email">
            <Input
              id="company_email"
              name="company_email"
              type="email"
              defaultValue={trainer?.company_email ?? ""}
            />
          </Field>
        </div>
      </div>

      <Checkbox
        name="rib_on_file"
        defaultChecked={trainer?.rib_on_file}
        label="RIB au dossier"
      />
    </div>
  );
}

export function TrainerForm({
  trainer,
  audiences = [],
  modalities = [],
}: TrainerFormProps) {
  const [status, setStatus] = useState(trainer?.status ?? "independant");
  const isExternal = status !== "salarie";

  return (
    <div className="space-y-4">
      {/* 1 — Identification */}
      <CollapsibleSection
        icon={User}
        title="Identification"
        description="Nom, prénom, statut et coordonnées."
        accent="emerald"
        defaultOpen
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Prénom" htmlFor="first_name" required>
              <Input
                id="first_name"
                name="first_name"
                required
                defaultValue={trainer?.first_name ?? ""}
              />
            </Field>
            <Field label="Nom" htmlFor="last_name" required>
              <UpperCaseInput
                id="last_name"
                name="last_name"
                required
                defaultValue={trainer?.last_name ?? ""}
              />
            </Field>
            <Field label="Statut" htmlFor="status">
              <select
                id="status"
                name="status"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as Trainer["status"])
                }
                className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
              >
                {Object.entries(TRAINER_STATUS_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={trainer?.email ?? ""}
              />
            </Field>
            <Field label="Téléphone" htmlFor="phone">
              <PhoneInput
                id="phone"
                name="phone"
                defaultValue={trainer?.phone ?? ""}
              />
            </Field>
            <Field label="Mobile" htmlFor="mobile">
              <PhoneInput
                id="mobile"
                name="mobile"
                defaultValue={trainer?.mobile ?? ""}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr_3fr]">
            <Field label="Adresse" htmlFor="address">
              <Input
                id="address"
                name="address"
                defaultValue={trainer?.address ?? ""}
              />
            </Field>
            <PostalCodeCity
              postalCodeName="postal_code"
              cityName="city"
              defaultPostalCode={trainer?.postal_code ?? ""}
              defaultCity={trainer?.city ?? ""}
              gridClassName="grid gap-4 grid-cols-[1fr_3fr]"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Pays" htmlFor="country">
              <Input
                id="country"
                name="country"
                defaultValue={trainer?.country ?? "France"}
              />
            </Field>
            <Field label="Date de naissance" htmlFor="birth_date">
              <Input
                id="birth_date"
                name="birth_date"
                type="date"
                defaultValue={trainer?.birth_date ?? ""}
              />
            </Field>
          </div>
        </div>
      </CollapsibleSection>

      {/* 2 — Entreprise / cadre légal externe */}
      {isExternal && (
        <CollapsibleSection
          icon={IdCard}
          title="Entreprise & SIRET"
          description="Informations légales et contact de l'entreprise."
          accent="blue"
        >
          <CompanySection trainer={trainer} />
        </CollapsibleSection>
      )}

      {/* 3 — Cadre contractuel */}
      <CollapsibleSection
        icon={FileText}
        title="Cadre contractuel"
        description="Contrat, convention, lettre de mission ou bon de commande."
        accent="violet"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Type de contrat" htmlFor="contract_type">
              <Input
                id="contract_type"
                name="contract_type"
                defaultValue={trainer?.contract_type ?? ""}
                placeholder="CDI, CDD, sous-traitance, prestation, vacation…"
              />
            </Field>
            <Field
              label="Référence du contrat"
              htmlFor="contract_reference"
            >
              <Input
                id="contract_reference"
                name="contract_reference"
                defaultValue={trainer?.contract_reference ?? ""}
              />
            </Field>
            <Field label="Début du contrat" htmlFor="contract_start_date">
              <Input
                id="contract_start_date"
                name="contract_start_date"
                type="date"
                defaultValue={trainer?.contract_start_date ?? ""}
              />
            </Field>
            <Field label="Fin du contrat" htmlFor="contract_end_date">
              <Input
                id="contract_end_date"
                name="contract_end_date"
                type="date"
                defaultValue={trainer?.contract_end_date ?? ""}
              />
            </Field>
          </div>
        </div>
      </CollapsibleSection>

      {/* 4 — Publics & modalités (les domaines/niveaux sont gérés
            séparément via la section "Domaines d'intervention" structurée
            qui utilise les catalogues de l'organisation). */}
      <CollapsibleSection
        icon={Briefcase}
        title="Publics & modalités"
        description="Publics visés, modalités d'animation et zone d'intervention."
        accent="blue"
        id="publics-modalites"
      >
        <PublicsModalitesEditor
          trainer={trainer}
          audiences={audiences}
          modalities={modalities}
        />
      </CollapsibleSection>

      {/* 5 — Compétences & expérience */}
      <CollapsibleSection
        icon={GraduationCap}
        title="Compétences & expérience"
        description="Compétences techniques, pédagogiques, années d'expérience."
        accent="emerald"
      >
        <div className="space-y-5">
          <Field
            label="Compétences techniques (métier)"
            htmlFor="technical_skills"
          >
            <Textarea
              id="technical_skills"
              name="technical_skills"
              rows={3}
              defaultValue={trainer?.technical_skills ?? ""}
              placeholder="Ex: 15 ans d'expérience en commande publique, expert Excel avancé…"
            />
          </Field>
          <Field
            label="Compétences pédagogiques"
            htmlFor="pedagogical_skills"
            hint="Animation, conception de supports, évaluation des acquis…"
          >
            <Textarea
              id="pedagogical_skills"
              name="pedagogical_skills"
              rows={3}
              defaultValue={trainer?.pedagogical_skills ?? ""}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Années d'expérience pro"
              htmlFor="years_pro_experience"
            >
              <Input
                id="years_pro_experience"
                name="years_pro_experience"
                type="number"
                min={0}
                defaultValue={trainer?.years_pro_experience ?? ""}
              />
            </Field>
            <Field
              label="Années d'expérience formation"
              htmlFor="years_training_experience"
            >
              <Input
                id="years_training_experience"
                name="years_training_experience"
                type="number"
                min={0}
                defaultValue={trainer?.years_training_experience ?? ""}
              />
            </Field>
          </div>
          <Field
            label="Exemples de formations animées"
            htmlFor="example_trainings"
          >
            <Textarea
              id="example_trainings"
              name="example_trainings"
              rows={3}
              defaultValue={trainer?.example_trainings ?? ""}
            />
          </Field>
        </div>
      </CollapsibleSection>

      {/* 6 — Adéquation Qualiopi (champ critique) */}
      <CollapsibleSection
        icon={ClipboardCheck}
        title="Adéquation Qualiopi"
        description="Pourquoi ce formateur est compétent pour les formations qui lui sont confiées (indic. 21)."
        accent="emerald"
        defaultOpen
      >
        <Field
          label="Justification de la compétence"
          htmlFor="competence_justification"
          hint="Réponse à la question clé de l'auditeur : « Pourquoi ce formateur est-il compétent pour cette formation précise ? »"
        >
          <Textarea
            id="competence_justification"
            name="competence_justification"
            rows={5}
            defaultValue={trainer?.competence_justification ?? ""}
            placeholder="Ex: 12 ans d'expérience opérationnelle dans le BTP, certification PMP, formé en pédagogie active. Animation régulière de la formation Mémoire technique BTP depuis 2022 avec satisfaction moyenne 4,7/5…"
          />
        </Field>
      </CollapsibleSection>

      {/* 7 — Évaluation */}
      <CollapsibleSection
        icon={Star}
        title="Évaluation du formateur"
        description="Satisfaction stagiaires, bilan, réclamations."
        accent="amber"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="Satisfaction moyenne"
              htmlFor="satisfaction_avg"
            >
              <Input
                id="satisfaction_avg"
                name="satisfaction_avg"
                type="number"
                step="0.1"
                min={0}
                defaultValue={trainer?.satisfaction_avg ?? ""}
              />
            </Field>
            <Field
              label="Échelle"
              htmlFor="satisfaction_scale"
              hint="Sur combien (5 ou 10)."
            >
              <Input
                id="satisfaction_scale"
                name="satisfaction_scale"
                type="number"
                min={1}
                max={10}
                defaultValue={trainer?.satisfaction_scale ?? 5}
              />
            </Field>
            <Field
              label="Date de la dernière évaluation"
              htmlFor="last_evaluation_date"
            >
              <Input
                id="last_evaluation_date"
                name="last_evaluation_date"
                type="date"
                defaultValue={trainer?.last_evaluation_date ?? ""}
              />
            </Field>
          </div>
          <Field label="Notes d'évaluation" htmlFor="evaluation_notes">
            <Textarea
              id="evaluation_notes"
              name="evaluation_notes"
              rows={3}
              defaultValue={trainer?.evaluation_notes ?? ""}
            />
          </Field>
          <Checkbox
            name="has_complaints"
            defaultChecked={trainer?.has_complaints}
            label="Réclamations enregistrées"
          />
          <Field
            label="Détail des réclamations"
            htmlFor="complaints_notes"
          >
            <Textarea
              id="complaints_notes"
              name="complaints_notes"
              rows={2}
              defaultValue={trainer?.complaints_notes ?? ""}
            />
          </Field>
        </div>
      </CollapsibleSection>

      {/* 8 — CPD : maintien des compétences (Qualiopi 22) */}
      <CollapsibleSection
        icon={TrendingUp}
        title="Maintien & développement des compétences"
        description="Formations suivies, veille, webinaires… (Qualiopi indic. 22)."
        accent="emerald"
      >
        <div className="space-y-5">
          <Field
            label="Actions de maintien / développement"
            htmlFor="cpd_actions"
            hint="Formations suivies, veille métier, webinaires, salons, lectures professionnelles, certifications renouvelées."
          >
            <Textarea
              id="cpd_actions"
              name="cpd_actions"
              rows={4}
              defaultValue={trainer?.cpd_actions ?? ""}
            />
          </Field>
          <Field
            label="Date de la dernière action"
            htmlFor="last_cpd_date"
          >
            <Input
              id="last_cpd_date"
              name="last_cpd_date"
              type="date"
              defaultValue={trainer?.last_cpd_date ?? ""}
            />
          </Field>
        </div>
      </CollapsibleSection>

      {/* 9 — Documents administratifs externes */}
      {isExternal && (
        <CollapsibleSection
          icon={ShieldCheck}
          title="Documents administratifs"
          description="URSSAF, RC pro, Kbis — obligatoires pour les externes."
          accent="rose"
        >
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <Checkbox
                  name="urssaf_attestation_on_file"
                  defaultChecked={trainer?.urssaf_attestation_on_file}
                  label="Attestation URSSAF au dossier"
                />
                <Field
                  label="Expire le"
                  htmlFor="urssaf_expires_on"
                >
                  <Input
                    id="urssaf_expires_on"
                    name="urssaf_expires_on"
                    type="date"
                    defaultValue={trainer?.urssaf_expires_on ?? ""}
                  />
                </Field>
              </div>
              <div className="space-y-3">
                <Checkbox
                  name="rc_pro_on_file"
                  defaultChecked={trainer?.rc_pro_on_file}
                  label="Attestation RC pro au dossier"
                />
                <Field
                  label="Expire le"
                  htmlFor="rc_pro_expires_on"
                >
                  <Input
                    id="rc_pro_expires_on"
                    name="rc_pro_expires_on"
                    type="date"
                    defaultValue={trainer?.rc_pro_expires_on ?? ""}
                  />
                </Field>
              </div>
            </div>
            <Checkbox
              name="kbis_on_file"
              defaultChecked={trainer?.kbis_on_file}
              label="Kbis / avis SIRENE au dossier"
            />
          </div>
        </CollapsibleSection>
      )}

      {/* 10 — Engagement qualité */}
      <CollapsibleSection
        icon={Award}
        title="Engagement qualité"
        description="Charte formateur, procédure handicap, règlement intérieur."
        accent="violet"
      >
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Checkbox
              name="charter_signed"
              defaultChecked={trainer?.charter_signed}
              label="Charte formateur signée"
            />
            <Field
              label="Date signature"
              htmlFor="charter_signed_on"
            >
              <Input
                id="charter_signed_on"
                name="charter_signed_on"
                type="date"
                defaultValue={trainer?.charter_signed_on ?? ""}
              />
            </Field>
            <Checkbox
              name="handicap_procedure_ack"
              defaultChecked={trainer?.handicap_procedure_ack}
              label="Procédure handicap connue et appliquée"
            />
            <Checkbox
              name="ri_ack"
              defaultChecked={trainer?.ri_ack}
              label="Règlement intérieur connu"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* 11 — Statut & validation */}
      <CollapsibleSection
        icon={BookOpen}
        title="Statut & validation"
        description="État du formateur dans votre référentiel."
        accent="zinc"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Statut de validation"
              htmlFor="validation_status"
            >
              <Select
                id="validation_status"
                name="validation_status"
                defaultValue={trainer?.validation_status ?? "a_valider"}
                options={Object.entries(TRAINER_VALIDATION_STATUS_LABELS).map(
                  ([k, l]) => ({ value: k, label: l }),
                )}
              />
            </Field>
            <div className="flex items-end">
              <Checkbox
                name="is_active"
                defaultChecked={trainer?.is_active ?? true}
                label="Formateur actif"
              />
            </div>
          </div>
          <Field label="Notes internes" htmlFor="notes_internal">
            <Textarea
              id="notes_internal"
              name="notes_internal"
              rows={3}
              defaultValue={trainer?.notes_internal ?? ""}
            />
          </Field>
        </div>
      </CollapsibleSection>
    </div>
  );
}
