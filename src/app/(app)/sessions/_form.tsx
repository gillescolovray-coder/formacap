import {
  Accessibility,
  Award,
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Brain,
  Euro,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CollapsibleSection } from "@/components/collapsible-section";
import { FormationPicker } from "./_formation-picker";
import { type LocationPickerItem } from "./_location-picker";
import { LocationSection } from "./_location-section";
import { PlanningSection } from "./_planning-section";
import { PricingBlock } from "./_pricing-block";
import { SubcontractPrescriberFields } from "./_subcontract-prescriber-fields";
import type { Formation } from "@/lib/formations/types";
import type {
  OrgDefaultHours,
  SessionDay,
  SessionStatusDef,
  TrainingSession,
} from "@/lib/sessions/types";
import {
  SESSION_ACTION_TYPE_LABELS,
  SESSION_STATUS_DESCRIPTIONS,
  SESSION_STATUS_LABELS,
  type SessionStatus,
} from "@/lib/sessions/types";

type LocationOption = LocationPickerItem;

type TrainerOption = {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
};

type CompanyOption = {
  id: string;
  name: string;
  /** Type d'entreprise (prospect/client/prescripteur/of/financeur/opco). */
  type?: string | null;
};

type OrgPricingDefaults = {
  interPresentielPerDay: number;
  interDistancielPerDay: number;
  intraPresentielForfait: number;
  intraPresentielExtraPerDay: number;
  intraDistancielForfait: number;
  intraDistancielExtraPerDay: number;
  threshold: number;
};

type SessionFormProps = {
  session?: TrainingSession;
  formations: Formation[];
  locations?: LocationOption[];
  trainers?: TrainerOption[];
  /** Liste des entreprises (pour le sélecteur d'OF donneur d'ordre). */
  companies?: CompanyOption[];
  /** Horaires par défaut de l'organisation (Paramètres). */
  orgDefaultHours?: OrgDefaultHours;
  /** Statuts personnalisés de l'organisation (Paramètres > Statuts).
   *  Si vide, on retombe sur la liste hardcodée SESSION_STATUS_LABELS. */
  customStatuses?: SessionStatusDef[];
  /** Tarifs par défaut de l'organisation, alimentent le bloc Tarification
   *  (placeholders + bouton "Réinitialiser"). */
  orgPricingDefaults?: OrgPricingDefaults;
  /** Nombre d'apprenants facturables actuellement inscrits, pour le preview
   *  total du bloc Tarification. */
  currentNbApprenants?: number;
  defaultFormationId?: string;
  /** Jours déjà persistés en base (édition). Source de vérité initiale
   *  pour la grille jour-par-jour, en remplacement d'une énumération
   *  start/end qui produit des faux jours pour les sessions à dates
   *  non consécutives. */
  existingDays?: SessionDay[];
  /** Quiz disponibles (statut 'published') pour rattachement à la session. */
  availableQuizzes?: Array<{ id: string; title: string }>;
  /** Templates de positionnement disponibles pour rattachement
   *  (migration 0105). Le 1er est généralement le template par défaut. */
  availablePositioningTemplates?: Array<{
    id: string;
    title: string;
    is_default: boolean;
  }>;
  /** Template de positionnement hérité de la formation (utilisé comme
   *  placeholder pour expliquer le fallback : "session = ce template"
   *  sinon "session = template de la formation X" sinon "default org"). */
  formationPositioningTemplate?: {
    id: string;
    title: string;
  } | null;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
};

export function SessionForm({
  session,
  formations,
  locations,
  trainers,
  companies,
  orgDefaultHours,
  customStatuses,
  orgPricingDefaults,
  currentNbApprenants,
  defaultFormationId,
  existingDays,
  availableQuizzes,
  availablePositioningTemplates,
  formationPositioningTemplate,
  action,
  submitLabel,
}: SessionFormProps) {
  // Liste des statuts à afficher dans le select : statuts persos s'ils
  // existent, sinon fallback sur les libellés hardcodés.
  const statusOptions =
    customStatuses && customStatuses.length > 0
      ? customStatuses.map((s) => ({
          code: s.code,
          label: s.label,
          description: s.description ?? "",
        }))
      : (
          Object.keys(SESSION_STATUS_LABELS) as Array<
            keyof typeof SESSION_STATUS_LABELS
          >
        ).map((key) => ({
          code: key as string,
          label: SESSION_STATUS_LABELS[key],
          description: SESSION_STATUS_DESCRIPTIONS[key] ?? "",
        }));
  const currentStatusCode =
    (session?.status as string | undefined) ?? statusOptions[0]?.code ?? "draft";
  const currentStatus =
    statusOptions.find((s) => s.code === currentStatusCode) ??
    statusOptions[0];

  // Règle métier : un bloc reste replié quand il ne contient pas encore
  // de donnée saisie. Pour les sessions existantes ayant déjà des champs
  // renseignés, le bloc s'ouvre par défaut afin de pouvoir éditer.
  const hasTypeSession = Boolean(
    session?.is_subcontracted || session?.subcontractor_name,
  );
  const hasQualiopi = Boolean(
    session?.internal_code ||
      (session?.action_type && session.action_type !== "action_formation") ||
      session?.nsf_specialty ||
      session?.target_diploma ||
      session?.target_certification,
  );
  const hasPlanning = Boolean(
    (existingDays && existingDays.length > 0) ||
      session?.start_date ||
      session?.end_date,
  );
  const hasCapacity = Boolean(
    session?.min_participants || session?.max_participants,
  );
  const hasPilotage = Boolean(
    session?.pedagogy_lead ||
      session?.financing_mode ||
      session?.accessibility_notes,
  );
  const hasTarification = Boolean(
    session?.pricing_mode ||
      session?.price_per_day_ht != null ||
      session?.price_forfait_ht != null ||
      session?.amount_ht != null,
  );
  const hasStatut = Boolean(session?.status);

  // Fallback défensif si la page parente n'a pas chargé les tarifs de
  // l'organisation : on retombe sur les valeurs publiques CAP NUMÉRIQUE
  // (alignées avec la migration 0063).
  const pricingDefaults: OrgPricingDefaults = orgPricingDefaults ?? {
    interPresentielPerDay: 340,
    interDistancielPerDay: 305,
    intraPresentielForfait: 1250,
    intraPresentielExtraPerDay: 175,
    intraDistancielForfait: 990,
    intraDistancielExtraPerDay: 150,
    threshold: 4,
  };

  // Nombre de jours pour le preview du total : on prend la longueur de
  // la liste des jours persistés (source de vérité), sinon 0 (la session
  // vient juste d'être créée et n'a pas encore de planning).
  const nbJoursForPreview = existingDays?.length ?? 0;
  const nbApprenantsForPreview = currentNbApprenants ?? 0;

  return (
    <form id="form-session" action={action} className="space-y-4">
      {/* Formation */}
      <CollapsibleSection
        icon={BookOpen}
        title="Formation"
        description="Quelle formation allez-vous animer pour cette session ?"
        accent="emerald"
        defaultOpen
        id="formation"
      >
        <div className="space-y-2">
          <Label htmlFor="formation_id" required>
            Formation
          </Label>
          {formations.length === 0 ? (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-300">
              Aucune formation disponible. Créez-en une dans le catalogue
              avant de planifier une session.
            </div>
          ) : (
            <FormationPicker
              formations={formations}
              defaultValue={session?.formation_id ?? defaultFormationId}
            />
          )}
        </div>
      </CollapsibleSection>

      {/* Type de session & sous-traitance — placés avant Qualiopi pour
          que le contexte commercial soit défini en premier. */}
      <CollapsibleSection
        icon={Briefcase}
        title="Type de session"
        description="Inter / intra et éventuelle sous-traitance pour un autre OF."
        accent="violet"
        defaultOpen={hasTypeSession}
        id="type-session"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {/* Toggle INTER / INTRA — segmented radio stylé */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <p className="text-sm font-medium mb-2">Type de session</p>
            <div className="relative inline-flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1 w-full">
              <input
                type="radio"
                id="is_inter_inter"
                name="is_inter"
                value="inter"
                defaultChecked={session ? session.is_inter : true}
                className="peer/inter sr-only"
              />
              <label
                htmlFor="is_inter_inter"
                className="flex-1 text-center text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-md cursor-pointer transition-colors text-zinc-600 peer-checked/inter:bg-cyan-600 peer-checked/inter:text-white peer-checked/inter:shadow"
                title="Session ouverte à plusieurs entreprises / particuliers"
              >
                Inter
              </label>
              <input
                type="radio"
                id="is_inter_intra"
                name="is_inter"
                value="intra"
                defaultChecked={session ? !session.is_inter : false}
                className="peer/intra sr-only"
              />
              <label
                htmlFor="is_inter_intra"
                className="flex-1 text-center text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-md cursor-pointer transition-colors text-zinc-600 peer-checked/intra:bg-amber-600 peer-checked/intra:text-white peer-checked/intra:shadow"
                title="Session dédiée à une seule entreprise"
              >
                Intra
              </label>
            </div>
            <p className="text-xs text-zinc-500 mt-1.5">
              <strong>Inter</strong> : ouverte à plusieurs entreprises.{" "}
              <strong>Intra</strong> : dédiée à une seule entreprise.
            </p>
          </div>
          <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900">
            <input
              type="checkbox"
              name="is_subcontracted"
              defaultChecked={session?.is_subcontracted ?? false}
              className="h-4 w-4 mt-0.5 rounded border-zinc-300"
            />
            <div>
              <span className="font-medium">Réalisée en sous-traitance</span>
              <p className="text-xs text-zinc-500 mt-0.5">
                Si la session est exécutée pour le compte d&apos;un autre OF.
              </p>
            </div>
          </label>
        </div>
        <SubcontractPrescriberFields
          companies={companies}
          defaultSubcontractorName={session?.subcontractor_name ?? ""}
          defaultPrescriberCompanyId={session?.prescriber_company_id ?? ""}
          defaultSubcontractingCompanyId={
            (session as unknown as { subcontracting_company_id?: string })
              ?.subcontracting_company_id ?? ""
          }
        />
      </CollapsibleSection>

      {/* Qualiopi */}
      <CollapsibleSection
        icon={Award}
        title="Qualiopi & catégorisation"
        description="Type d'action, spécialité, code, certification visée."
        accent="amber"
        defaultOpen={hasQualiopi}
        id="qualiopi"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="internal_code">Code interne de session</Label>
            <Input
              id="internal_code"
              name="internal_code"
              defaultValue={session?.internal_code ?? ""}
              placeholder="Ex: SES-2026-001"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="action_type">Type d&apos;action de formation</Label>
            <Select
              name="action_type"
              defaultValue={session?.action_type ?? "action_formation"}
              items={Object.entries(SESSION_ACTION_TYPE_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
            >
              <SelectTrigger id="action_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(SESSION_ACTION_TYPE_LABELS) as Array<
                    keyof typeof SESSION_ACTION_TYPE_LABELS
                  >
                ).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SESSION_ACTION_TYPE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nsf_specialty">Spécialité NSF</Label>
            <Input
              id="nsf_specialty"
              name="nsf_specialty"
              defaultValue={session?.nsf_specialty ?? ""}
              placeholder="Ex: 326 - Informatique, traitement de l'information"
            />
            <p className="text-xs text-zinc-500">
              Code à 3 chiffres de la nomenclature des spécialités de formation.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="target_diploma">Diplôme visé</Label>
            <Input
              id="target_diploma"
              name="target_diploma"
              defaultValue={session?.target_diploma ?? ""}
              placeholder="Ex: BTS, RNCP 35273…"
            />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="target_certification">
              Nom du titre / certification visée
            </Label>
            <Input
              id="target_certification"
              name="target_certification"
              defaultValue={session?.target_certification ?? ""}
              placeholder="Ex: Concepteur développeur d'applications"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Planning */}
      <CollapsibleSection
        icon={CalendarDays}
        title="Planning"
        description="Dates et horaires par défaut de la session."
        accent="blue"
        defaultOpen={hasPlanning}
        id="planning"
      >
        <PlanningSection
          session={session}
          existingDays={existingDays}
          orgDefaultHours={orgDefaultHours}
          initialFormationDurationDays={
            formations.find(
              (f) =>
                f.id === (session?.formation_id ?? defaultFormationId ?? ""),
            )?.duration_days ?? null
          }
          trainers={(trainers ?? []).map((t) => ({
            id: t.id,
            first_name: t.first_name,
            last_name: t.last_name,
            company_name: t.company_name ?? null,
          }))}
        />
      </CollapsibleSection>

      {/* Lieu & modalité */}
      <LocationSection session={session} locations={locations} />

      {/* Formateur */}
      {/* Formateur principal — UI supprimée. Le formateur est désormais
          choisi jour par jour dans le planning détaillé. Les valeurs
          existantes (sessions créées avant ce changement) sont préservées
          via ces inputs cachés pour ne rien perdre en BDD. */}
      <input
        type="hidden"
        name="trainer_id"
        value={session?.trainer_id ?? ""}
      />
      <input
        type="hidden"
        name="trainer_name"
        value={session?.trainer_name ?? ""}
      />
      <input
        type="hidden"
        name="trainer_notes"
        value={session?.trainer_notes ?? ""}
      />

      {/* Capacité */}
      <CollapsibleSection
        icon={Users}
        title="Capacité"
        description="Nombre de participants attendus."
        accent="amber"
        defaultOpen={hasCapacity}
        id="capacite"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="min_participants">Minimum</Label>
            <Input
              id="min_participants"
              name="min_participants"
              type="number"
              min="0"
              defaultValue={session?.min_participants ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_participants">Maximum</Label>
            <Input
              id="max_participants"
              name="max_participants"
              type="number"
              min="0"
              defaultValue={session?.max_participants ?? ""}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Pilotage Qualiopi : responsable péda, accessibilité, financement */}
      <CollapsibleSection
        icon={ShieldCheck}
        title="Pilotage & Qualiopi"
        description="Responsable pédagogique, accessibilité handicap, mode de financement."
        accent="emerald"
        defaultOpen={hasPilotage}
        id="pilotage"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pedagogy_lead">Responsable pédagogique</Label>
            <Input
              id="pedagogy_lead"
              name="pedagogy_lead"
              defaultValue={session?.pedagogy_lead ?? ""}
              placeholder="Ex : Gilles COLOVRAY (CAP NUMÉRIQUE)"
            />
            <p className="text-xs text-zinc-500">
              Référent interne en charge du pilotage pédagogique de cette
              session.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="financing_mode">Mode de financement principal</Label>
            <select
              id="financing_mode"
              name="financing_mode"
              defaultValue={session?.financing_mode ?? ""}
              className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
            >
              <option value="">— Non précisé —</option>
              <option value="entreprise">Entreprise (plan dev. comp.)</option>
              <option value="opco">OPCO</option>
              <option value="cpf">CPF</option>
              <option value="particulier">Particulier (auto-financement)</option>
              <option value="pole_emploi">Pôle emploi / France Travail</option>
              <option value="region">Région / Conseil régional</option>
              <option value="fse">FSE / FSE+</option>
              <option value="mixte">Financement mixte</option>
              <option value="autre">Autre</option>
            </select>
            <p className="text-xs text-zinc-500">
              Indicatif. Chaque inscription peut avoir son propre mode de
              financement.
            </p>
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label
              htmlFor="accessibility_notes"
              className="flex items-center gap-1.5"
            >
              <Accessibility className="h-3.5 w-3.5" />
              Accessibilité handicap (Qualiopi indic. 26)
            </Label>
            <Input
              id="accessibility_notes"
              name="accessibility_notes"
              defaultValue={session?.accessibility_notes ?? ""}
              placeholder="Ex : Salle PMR, supports adaptés malvoyants, interprète LSF sur demande…"
            />
            <p className="text-xs text-zinc-500">
              Adaptations matérielles ou pédagogiques prévues pour cette
              session. Laisser vide si standard.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Tarification (R7 — cascade ORG → Session → Inscription → Convention) */}
      <CollapsibleSection
        icon={Euro}
        title="Tarification"
        description="Prix HT public de la session — utilisé par défaut pour chaque inscription, et repris sur la convention."
        accent="emerald"
        defaultOpen={hasTarification}
        id="tarification"
      >
        <PricingBlock
          defaultMode={session?.pricing_mode ?? null}
          defaultPricePerDayHt={session?.price_per_day_ht ?? null}
          defaultPriceForfaitHt={session?.price_forfait_ht ?? null}
          defaultPriceExtraPerDayHt={session?.price_extra_per_day_ht ?? null}
          defaultThreshold={session?.pricing_threshold ?? null}
          currentNbApprenants={nbApprenantsForPreview}
          currentNbJours={nbJoursForPreview}
          orgDefaults={pricingDefaults}
        />
      </CollapsibleSection>

      {/* Statut & notes */}
      <CollapsibleSection
        icon={ClipboardList}
        title="Statut & notes"
        description="État d'avancement et commentaires libres."
        accent="zinc"
        defaultOpen={hasStatut}
        id="statut"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="status">Statut</Label>
            <select
              id="status"
              name="status"
              defaultValue={currentStatusCode}
              className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400"
            >
              {statusOptions.map((s) => (
                <option key={s.code} value={s.code} title={s.description}>
                  {s.label}
                </option>
              ))}
            </select>
            {currentStatus?.description && (
              <p className="text-xs text-zinc-500">
                {currentStatus.description}
              </p>
            )}
            {customStatuses === undefined || customStatuses.length === 0 ? (
              <p className="text-[11px] text-zinc-400 italic">
                Vous pouvez personnaliser les statuts dans Paramètres → Statuts
                de session.
              </p>
            ) : null}
          </div>
        </div>
      </CollapsibleSection>

      {/* Quiz d'évaluation (pré + post session) */}
      <CollapsibleSection
        icon={Brain}
        title="Quiz d'évaluation"
        description="Quiz joué par l'apprenant en début et en fin de session pour mesurer la progression."
        accent="violet"
        defaultOpen={!!session?.quiz_template_id}
        id="quiz"
      >
        <div className="space-y-2">
          <Label htmlFor="quiz_template_id">Quiz rattaché à cette session</Label>
          <select
            id="quiz_template_id"
            name="quiz_template_id"
            defaultValue={session?.quiz_template_id ?? ""}
            className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="">— Aucun quiz —</option>
            {(availableQuizzes ?? []).map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            Les apprenants pourront jouer ce quiz depuis leur portail
            personnel : une fois avant le début (pré-session) puis une fois
            à la fin (post-session). La comparaison des deux scores mesure
            la progression.
            {(availableQuizzes ?? []).length === 0 && (
              <>
                {" "}
                <a
                  href="/parametres/quiz"
                  target="_blank"
                  className="text-cyan-700 underline"
                >
                  Créer un quiz dans Paramètres → Quiz
                </a>{" "}
                puis le publier pour le voir apparaître ici.
              </>
            )}
          </p>
        </div>
      </CollapsibleSection>

      {/* Test de positionnement (Qualiopi) — override par session
          (Gilles 2026-05-25). Migration 0105. */}
      <CollapsibleSection
        icon={Target}
        title="Test de positionnement (Qualiopi)"
        description="Modèle de questionnaire d'auto-positionnement rempli par l'apprenant avant la session. Par défaut on hérite de la formation, ou du modèle 'par défaut' de l'organisation."
        accent="amber"
        defaultOpen={!!session?.positioning_template_id}
        id="positionnement"
      >
        <div className="space-y-2">
          <Label htmlFor="positioning_template_id">
            Modèle pour cette session
          </Label>
          <select
            id="positioning_template_id"
            name="positioning_template_id"
            defaultValue={session?.positioning_template_id ?? ""}
            className="flex h-9 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="">
              — Hériter
              {formationPositioningTemplate
                ? ` (formation : ${formationPositioningTemplate.title})`
                : " (modèle par défaut de l'organisme)"}{" "}
              —
            </option>
            {(availablePositioningTemplates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.is_default ? " (par défaut)" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            Laissez vide pour utiliser le modèle hérité de la formation ;
            sélectionnez un modèle pour <strong>forcer un test spécifique</strong>{" "}
            sur cette session uniquement.{" "}
            <a
              href="/parametres/positionnement"
              target="_blank"
              className="text-cyan-700 underline"
            >
              Voir la bibliothèque des tests
            </a>
            .
          </p>
        </div>
      </CollapsibleSection>

      <div className="flex justify-end gap-3 border-t pt-6">
        <SubmitButton pendingLabel="Enregistrement…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
