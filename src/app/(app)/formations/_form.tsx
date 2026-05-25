import Link from "next/link";
import {
  Accessibility,
  Award,
  BadgeEuro,
  BarChart3,
  Briefcase,
  Building2,
  Calculator,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Crosshair,
  FileText,
  FolderTree,
  GraduationCap,
  Hash,
  IdCard,
  ImageIcon,
  Info,
  Lightbulb,
  ListChecks,
  Monitor,
  Quote,
  Save,
  ShieldCheck,
  Tag,
  Target,
  TrendingUp,
  Type,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UpperCaseInput } from "@/components/ui/uppercase-input";
import { UpperCaseTextarea } from "@/components/ui/uppercase-textarea";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CollapsibleSection } from "@/components/collapsible-section";
import type {
  Formation,
  FormationCategory,
} from "@/lib/formations/types";
import {
  MODALITY_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
} from "@/lib/formations/types";
import { cn } from "@/lib/utils";
import { ProgrammeBuilder } from "./_programme-builder";
import { ProgrammePdfCard } from "./[id]/_programme-pdf-card";

type FormationFormProps = {
  formation?: Formation;
  categories: FormationCategory[];
  /** Templates de positionnement disponibles (migration 0105). */
  availablePositioningTemplates?: Array<{
    id: string;
    title: string;
    is_default: boolean;
  }>;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  headerSlot?: React.ReactNode;
};

export function FormationForm({
  formation,
  categories,
  availablePositioningTemplates,
  action,
  submitLabel,
  headerSlot,
}: FormationFormProps) {
  const objectivesText = formation?.operational_objectives.join("\n") ?? "";

  return (
    <form id="form-formation" action={action} className="space-y-3">
      {headerSlot}

      {/* Section 1 — Identification */}
      <CollapsibleSection
        icon={IdCard}
        title="Identification"
        description="Intitulé, référence, catégorie et description."
        accent="emerald"
        defaultOpen
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2 rounded-xl border-2 border-cyan-400 dark:border-cyan-600 bg-cyan-50 dark:bg-cyan-950/30 p-3.5 space-y-2 shadow-sm shadow-cyan-200/50 dark:shadow-cyan-950/30">
            <Label
              htmlFor="title"
              className="flex items-center gap-2 text-sm font-bold text-cyan-800 dark:text-cyan-200"
            >
              <Type className="h-4 w-4" />
              Intitulé de la formation
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 ring-1 ring-red-200 dark:ring-red-900">
                <span className="text-red-600 dark:text-red-400">*</span>
                Obligatoire
              </span>
            </Label>
            <UpperCaseTextarea
              id="title"
              name="title"
              required
              defaultValue={formation?.title ?? ""}
              placeholder="EX : MÉMOIRES TECHNIQUES – IA & STRATÉGIE DE RÉPONSE"
              className="bg-white dark:bg-zinc-900 font-semibold border-cyan-300 dark:border-cyan-800 focus-visible:ring-cyan-500"
            />
          </div>
          <div className="rounded-xl border border-teal-200 dark:border-teal-900/50 bg-teal-50/50 dark:bg-teal-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="internal_code"
              className="flex items-center gap-2 text-sm font-semibold text-teal-700 dark:text-teal-300"
            >
              <Hash className="h-4 w-4" />
              Référence interne
            </Label>
            <Input
              id="internal_code"
              name="internal_code"
              defaultValue={formation?.internal_code ?? ""}
              placeholder="Ex: FP-BPMTv4"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/50 dark:bg-cyan-950/20 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="category_id"
                className="flex items-center gap-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300"
              >
                <FolderTree className="h-4 w-4" />
                Catégorie
              </Label>
              <Link
                href="/formations/categories"
                className="text-xs text-zinc-500 hover:underline"
              >
                Gérer
              </Link>
            </div>
            <Select
              name="category_id"
              defaultValue={formation?.category_id ?? ""}
              items={categories.map((c) => ({ value: c.id, label: c.name }))}
            >
              <SelectTrigger id="category_id" className="bg-white dark:bg-zinc-900">
                <SelectValue placeholder="Aucune catégorie" />
              </SelectTrigger>
              <SelectContent>
                {categories.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-zinc-500">
                    Aucune catégorie disponible.
                  </div>
                ) : (
                  categories.map((c) => (
                    <SelectItem key={c.id} value={c.id} label={c.name}>
                      {c.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 rounded-xl border border-sky-200 dark:border-sky-900/50 bg-sky-50/50 dark:bg-sky-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="subtitle"
              className="flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-300"
            >
              <Quote className="h-4 w-4" />
              Sous-titre
            </Label>
            <Input
              id="subtitle"
              name="subtitle"
              defaultValue={formation?.subtitle ?? ""}
              placeholder="Ex: Devenir expert en réponse aux marchés publics avec l'IA"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="md:col-span-2 rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/50 dark:bg-cyan-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="description"
              className="flex items-center gap-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300"
            >
              <FileText className="h-4 w-4" />
              Description courte
            </Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={formation?.description ?? ""}
              placeholder="Résumé affiché dans les listings et catalogues"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="rounded-xl border border-lime-200 dark:border-lime-900/50 bg-lime-50/50 dark:bg-lime-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="cover_image_url"
              className="flex items-center gap-2 text-sm font-semibold text-lime-700 dark:text-lime-300"
            >
              <ImageIcon className="h-4 w-4" />
              Image de couverture (URL)
            </Label>
            <Input
              id="cover_image_url"
              name="cover_image_url"
              type="url"
              defaultValue={formation?.cover_image_url ?? ""}
              placeholder="https://… (16:9 idéal)"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/30 dark:bg-cyan-950/15 p-3.5 space-y-2">
            <Label
              htmlFor="version_date"
              className="flex items-center gap-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300"
            >
              <CalendarClock className="h-4 w-4" />
              Date de version
            </Label>
            <Input
              id="version_date"
              name="version_date"
              type="date"
              defaultValue={formation?.version_date ?? ""}
              className="bg-white dark:bg-zinc-900"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 2 — Durée, effectif & modalité */}
      <CollapsibleSection
        icon={Clock}
        title="Durée, effectif & modalité"
        description="Volume horaire, jauge de participants et format."
        accent="blue"
      >
        <div className="grid gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="duration_days"
              className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"
            >
              <CalendarRange className="h-4 w-4" />
              Jours
            </Label>
            <Input
              id="duration_days"
              name="duration_days"
              type="number"
              step="0.5"
              min="0"
              defaultValue={formation?.duration_days ?? ""}
              placeholder="Ex: 2 ou 0.5"
              className="bg-white dark:bg-zinc-900"
            />
            <p className="text-[10px] text-blue-700/70 dark:text-blue-400/70 italic">
              Accepte 0.5, 1, 1.5, 2… (demi-journée = 0.5)
            </p>
          </div>
          <div className="rounded-xl border border-sky-200 dark:border-sky-900/50 bg-sky-50/50 dark:bg-sky-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="duration_hours"
              className="flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-300"
            >
              <Clock className="h-4 w-4" />
              Heures
            </Label>
            <Input
              id="duration_hours"
              name="duration_hours"
              type="number"
              step="0.5"
              min="0"
              defaultValue={formation?.duration_hours ?? ""}
              placeholder="Ex: 14"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/50 dark:bg-cyan-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="modality"
              className="flex items-center gap-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300"
            >
              <Monitor className="h-4 w-4" />
              Modalité
            </Label>
            <Select
              name="modality"
              defaultValue={formation?.modality ?? ""}
              items={Object.entries(MODALITY_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
            >
              <SelectTrigger id="modality" className="bg-white dark:bg-zinc-900">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(MODALITY_LABELS) as Array<
                    keyof typeof MODALITY_LABELS
                  >
                ).map((key) => (
                  <SelectItem key={key} value={key}>
                    {MODALITY_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="min_participants"
              className="flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300"
            >
              <User className="h-4 w-4" />
              Effectif min
            </Label>
            <Input
              id="min_participants"
              name="min_participants"
              type="number"
              min="0"
              defaultValue={formation?.min_participants ?? ""}
              placeholder="Ex: 3"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="max_participants"
              className="flex items-center gap-2 text-sm font-semibold text-violet-700 dark:text-violet-300"
            >
              <Users className="h-4 w-4" />
              Effectif max
            </Label>
            <Input
              id="max_participants"
              name="max_participants"
              type="number"
              min="0"
              defaultValue={formation?.max_participants ?? ""}
              placeholder="Ex: 10"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 3 — Public & objectifs */}
      <CollapsibleSection
        icon={Target}
        title="Public & objectifs"
        description="À qui s'adresse la formation et ce qu'elle vise."
        accent="rose"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="target_audience"
              className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300"
            >
              <Users className="h-4 w-4" />
              Publics visés
            </Label>
            <Textarea
              id="target_audience"
              name="target_audience"
              rows={3}
              defaultValue={formation?.target_audience ?? ""}
              placeholder="Ex: Responsables d'entreprises, commerciaux, chargés d'affaires…"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="rounded-xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="prerequisites"
              className="flex items-center gap-2 text-sm font-semibold text-orange-700 dark:text-orange-300"
            >
              <ClipboardList className="h-4 w-4" />
              Prérequis
            </Label>
            <Textarea
              id="prerequisites"
              name="prerequisites"
              rows={3}
              defaultValue={formation?.prerequisites ?? ""}
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="md:col-span-2 rounded-xl border border-pink-200 dark:border-pink-900/50 bg-pink-50/50 dark:bg-pink-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="general_objective"
              className="flex items-center gap-2 text-sm font-semibold text-pink-700 dark:text-pink-300"
            >
              <Crosshair className="h-4 w-4" />
              Objectif général
            </Label>
            <Textarea
              id="general_objective"
              name="general_objective"
              rows={2}
              defaultValue={formation?.general_objective ?? ""}
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="md:col-span-2 rounded-xl border border-fuchsia-200 dark:border-fuchsia-900/50 bg-fuchsia-50/50 dark:bg-fuchsia-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="operational_objectives"
              className="flex items-center gap-2 text-sm font-semibold text-fuchsia-700 dark:text-fuchsia-300"
            >
              <CheckCircle2 className="h-4 w-4" />
              Objectifs opérationnels
            </Label>
            <Textarea
              id="operational_objectives"
              name="operational_objectives"
              rows={5}
              defaultValue={objectivesText}
              placeholder="Un objectif par ligne"
              className="bg-white dark:bg-zinc-900"
            />
            <p className="text-xs text-zinc-500">
              Un objectif par ligne. Exemple : « Améliorer la rédaction du
              mémoire technique ».
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 4 — Pédagogie & évaluation */}
      <CollapsibleSection
        icon={GraduationCap}
        title="Pédagogie & évaluation"
        description="Approche, méthodes, moyens techniques et évaluation."
        accent="violet"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {/* Approche pédagogique */}
          <div className="md:col-span-2 rounded-xl border border-violet-200/70 dark:border-violet-900/50 bg-gradient-to-br from-violet-50/60 to-white dark:from-violet-950/20 dark:to-zinc-900 p-4 space-y-2">
            <Label
              htmlFor="pedagogy_approach"
              className="flex items-center gap-2 font-semibold text-violet-900 dark:text-violet-200"
            >
              <span className="h-7 w-7 rounded-lg bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 flex items-center justify-center">
                <Lightbulb className="h-4 w-4" />
              </span>
              Approche pédagogique
            </Label>
            <Textarea
              id="pedagogy_approach"
              name="pedagogy_approach"
              rows={3}
              defaultValue={formation?.pedagogy_approach ?? ""}
              placeholder="Ex: Animation favorisant la réflexion et les échanges, apports théoriques et pratiques…"
              className="bg-white dark:bg-zinc-900"
            />
          </div>

          {/* Méthodes pédagogiques */}
          <div className="rounded-xl border border-blue-200/70 dark:border-blue-900/50 bg-gradient-to-br from-blue-50/60 to-white dark:from-blue-950/20 dark:to-zinc-900 p-4 space-y-2">
            <Label
              htmlFor="teaching_methods"
              className="flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-200"
            >
              <span className="h-7 w-7 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                <ListChecks className="h-4 w-4" />
              </span>
              Méthodes pédagogiques
            </Label>
            <Textarea
              id="teaching_methods"
              name="teaching_methods"
              rows={3}
              defaultValue={formation?.teaching_methods ?? ""}
              placeholder="Ex: Tour de table, alternance d'apport théorique et mise en situation, quiz d'entrée/sortie…"
              className="bg-white dark:bg-zinc-900"
            />
          </div>

          {/* Moyens techniques */}
          <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800/50 bg-gradient-to-br from-zinc-50/60 to-white dark:from-zinc-900/40 dark:to-zinc-900 p-4 space-y-2">
            <Label
              htmlFor="technical_means"
              className="flex items-center gap-2 font-semibold text-zinc-800 dark:text-zinc-200"
            >
              <span className="h-7 w-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center">
                <Monitor className="h-4 w-4" />
              </span>
              Moyens techniques
            </Label>
            <Textarea
              id="technical_means"
              name="technical_means"
              rows={3}
              defaultValue={formation?.technical_means ?? ""}
              placeholder="Ex: Poste informatique équipé de Word, Excel, PDF, navigateur web à jour…"
              className="bg-white dark:bg-zinc-900"
            />
          </div>

          {/* Modalités d'évaluation */}
          <div className="rounded-xl border border-cyan-200/70 dark:border-cyan-900/50 bg-gradient-to-br from-cyan-50/60 to-white dark:from-cyan-950/20 dark:to-zinc-900 p-4 space-y-2">
            <Label
              htmlFor="evaluation_methods"
              className="flex items-center gap-2 font-semibold text-cyan-900 dark:text-cyan-200"
            >
              <span className="h-7 w-7 rounded-lg bg-cyan-100 dark:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 flex items-center justify-center">
                <ClipboardCheck className="h-4 w-4" />
              </span>
              Modalités d&apos;évaluation
            </Label>
            <Textarea
              id="evaluation_methods"
              name="evaluation_methods"
              rows={3}
              defaultValue={formation?.evaluation_methods ?? ""}
              placeholder="Ex: Évaluation des acquis sur exercices, attestation d'assiduité, quiz…"
              className="bg-white dark:bg-zinc-900"
            />
          </div>

          {/* Test de positionnement (Qualiopi) — migration 0105.
              Permet de rattacher un template specifique a la formation,
              qui sera applique automatiquement aux sessions creees a
              partir de celle-ci (sauf override sur la session). */}
          <div className="rounded-xl border border-amber-200/70 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-zinc-900 p-4 space-y-2">
            <Label
              htmlFor="positioning_template_id"
              className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200"
            >
              <span className="h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                <Target className="h-4 w-4" />
              </span>
              Test de positionnement (Qualiopi)
            </Label>
            <select
              id="positioning_template_id"
              name="positioning_template_id"
              defaultValue={formation?.positioning_template_id ?? ""}
              className="flex h-9 w-full rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-zinc-900 px-3 py-1 text-sm shadow-sm"
            >
              <option value="">
                — Modèle par défaut de l&apos;organisme —
              </option>
              {(availablePositioningTemplates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.is_default ? " (par défaut)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/70">
              Modèle proposé aux apprenants des sessions issues de cette
              formation. Laissez vide pour utiliser le modèle par défaut de
              votre organisme.{" "}
              <a
                href="/parametres/positionnement"
                target="_blank"
                className="text-amber-900 underline hover:no-underline"
              >
                Bibliothèque
              </a>
              .
            </p>
          </div>

          {/* Accessibilité handicap */}
          <div className="rounded-xl border border-amber-200/70 dark:border-amber-900/50 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-zinc-900 p-4 space-y-2">
            <Label
              htmlFor="accessibility"
              className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200"
            >
              <span className="h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                <Accessibility className="h-4 w-4" />
              </span>
              Accessibilité handicap
            </Label>
            <Textarea
              id="accessibility"
              name="accessibility"
              rows={3}
              defaultValue={formation?.accessibility ?? ""}
              placeholder="Ex: accès PMR, adaptations possibles selon le handicap, contact référent…"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 5 — Programme détaillé */}
      <CollapsibleSection
        icon={CalendarRange}
        title="Programme détaillé"
        description="Soit en PDF joint, soit saisi journée par journée ci-dessous."
        accent="amber"
      >
        {formation?.id ? (
          <ProgrammePdfCard
            formationId={formation.id}
            pdfUrl={formation.programme_pdf_url}
            pdfName={formation.programme_pdf_name}
          />
        ) : (
          <div className="rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border-2 border-dashed border-blue-200 dark:border-blue-900 p-5">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 shrink-0 rounded-lg flex items-center justify-center bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13 5l7 7-7 7M5 12h15" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold tracking-tight">
                  Option A — Programme au format PDF
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Disponible après création de la formation. Enregistrez
                  d&apos;abord la fiche (bouton « Créer la formation » en bas)
                  puis vous pourrez joindre un PDF depuis cette même section.
                </p>
              </div>
            </div>
          </div>
        )}
        <ProgrammeBuilder initialDays={formation?.programme_days} />
      </CollapsibleSection>

      {/* Section — Suivi & qualité Qualiopi */}
      <CollapsibleSection
        icon={ShieldCheck}
        title="Suivi & qualité (Qualiopi)"
        description="Suivi d'exécution, certification, indicateurs qualité et compétences."
        accent="rose"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="execution_followup"
              className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300"
            >
              <ClipboardCheck className="h-4 w-4" />
              Suivi de l&apos;exécution
            </Label>
            <Textarea
              id="execution_followup"
              name="execution_followup"
              rows={3}
              defaultValue={formation?.execution_followup ?? ""}
              placeholder="Ex: Émargement par demi-journée, justificatifs de présence, comptes rendus…"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="rounded-xl border border-pink-200 dark:border-pink-900/50 bg-pink-50/50 dark:bg-pink-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="certification_terms"
              className="flex items-center gap-2 text-sm font-semibold text-pink-700 dark:text-pink-300"
            >
              <Award className="h-4 w-4" />
              Modalités de certification
            </Label>
            <Textarea
              id="certification_terms"
              name="certification_terms"
              rows={3}
              defaultValue={formation?.certification_terms ?? ""}
              placeholder="Ex: Attestation d'assiduité, examen final, validation par jury…"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="rounded-xl border border-fuchsia-200 dark:border-fuchsia-900/50 bg-fuchsia-50/50 dark:bg-fuchsia-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="quality_indicators"
              className="flex items-center gap-2 text-sm font-semibold text-fuchsia-700 dark:text-fuchsia-300"
            >
              <BarChart3 className="h-4 w-4" />
              Indicateurs qualité
            </Label>
            <Textarea
              id="quality_indicators"
              name="quality_indicators"
              rows={3}
              defaultValue={formation?.quality_indicators ?? ""}
              placeholder="Ex: Taux de satisfaction, taux de réussite, taux d'abandon…"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="competence_domains"
              className="flex items-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300"
            >
              <TrendingUp className="h-4 w-4" />
              Domaines de compétences
            </Label>
            <Textarea
              id="competence_domains"
              name="competence_domains"
              rows={3}
              defaultValue={formation?.competence_domains?.join("\n") ?? ""}
              placeholder="Un domaine par ligne&#10;Ex: Analyse d'appel d'offres&#10;Rédaction commerciale"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 6 — Commercial & Tarification */}
      <CollapsibleSection
        icon={BadgeEuro}
        title="Commercial & Tarification"
        description="Tarifs par défaut, éligibilité CPF, statut et publication en ligne."
        accent="zinc"
      >
        <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/50 dark:bg-cyan-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="price_company"
              className="flex items-center gap-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300"
            >
              <Building2 className="h-4 w-4" />
              Tarif Entreprise HT par défaut (€)
            </Label>
            <Input
              id="price_company"
              name="price_company"
              type="number"
              step="0.01"
              min="0"
              defaultValue={
                formation?.price_company ??
                formation?.public_price_excl_tax ??
                ""
              }
              placeholder="Ex: 1500"
              className="bg-white dark:bg-zinc-900"
            />
            <p className="text-[11px] text-slate-500 italic">
              Affiché par défaut sur les devis et le catalogue public.
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 space-y-2">
            <Label
              htmlFor="price_individual"
              className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300"
            >
              <User className="h-4 w-4" />
              Tarif Particulier HT (€)
            </Label>
            <Input
              id="price_individual"
              name="price_individual"
              type="number"
              step="0.01"
              min="0"
              defaultValue={formation?.price_individual ?? ""}
              placeholder="Ex: 1200"
              className="bg-white dark:bg-zinc-900"
            />
            <p className="text-[11px] text-slate-500 italic">
              Pour les particuliers (CPF, autofinancement).
            </p>
          </div>
        </div>

        {/* Statut — bouton plus visible (3 pastilles cliquables au lieu
            d'un select discret) */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Statut de la formation</Label>
          <div className="flex flex-wrap gap-2">
            {(
              Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>
            ).map((key) => {
              const isActive = (formation?.status ?? "draft") === key;
              return (
                <label
                  key={key}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all flex-1 min-w-[140px]",
                    isActive
                      ? STATUS_BADGE_CLASSES[key] +
                          " ring-2 ring-offset-1 ring-current shadow-sm"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50",
                  )}
                >
                  <input
                    type="radio"
                    name="status"
                    value={key}
                    defaultChecked={isActive}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-bold">
                    {STATUS_LABELS[key]}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900">
            <input
              type="checkbox"
              name="is_cpf_eligible"
              defaultChecked={formation?.is_cpf_eligible ?? false}
              className="h-4 w-4 mt-0.5 rounded border-zinc-300"
            />
            <div>
              <span className="font-medium">Éligible CPF</span>
              <p className="text-xs text-zinc-500 mt-0.5">
                Compte Personnel de Formation — formation finançable via CPF.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900">
            <input
              type="checkbox"
              name="is_published_online"
              defaultChecked={formation?.is_published_online ?? false}
              className="h-4 w-4 mt-0.5 rounded border-zinc-300"
            />
            <div>
              <span className="font-medium">Publier sur le catalogue en ligne</span>
              <p className="text-xs text-zinc-500 mt-0.5">
                Visible sur votre site vitrine ou portail public.
              </p>
            </div>
          </label>
        </div>
        </div>
      </CollapsibleSection>

      {/* Section — Comptabilité */}
      <CollapsibleSection
        icon={Calculator}
        title="Comptabilité"
        description="Codes comptables pour l'export en comptabilité (optionnels)."
        accent="zinc"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 p-3.5 space-y-2">
            <Label
              htmlFor="accounting_product_code"
              className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300"
            >
              <Tag className="h-4 w-4" />
              Compte de produits
            </Label>
            <Input
              id="accounting_product_code"
              name="accounting_product_code"
              defaultValue={formation?.accounting_product_code ?? ""}
              placeholder="Ex: 706000 - Prestations de services"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-3.5 space-y-2">
            <Label
              htmlFor="accounting_analytic_code"
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              <Info className="h-4 w-4" />
              Code analytique
            </Label>
            <Input
              id="accounting_analytic_code"
              name="accounting_analytic_code"
              defaultValue={formation?.accounting_analytic_code ?? ""}
              placeholder="Ex: FORMA-2026"
              className="bg-white dark:bg-zinc-900"
            />
          </div>
        </div>
      </CollapsibleSection>

      <div className="flex justify-end gap-3 border-t pt-6">
        <Button type="submit" size="lg">
          <Save className="h-4 w-4" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
