import Link from "next/link";
import { headers } from "next/headers";
import {
  Briefcase,
  CheckCircle2,
  ExternalLink,
  FileDown,
  Mail,
  MapPin,
  Phone,
  Save,
  Trash2,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildTrainerPortalUrl,
  getOrCreateTrainerPortalToken,
} from "@/lib/portal/trainer-token";
import { TrainerForm } from "../_form";
import { deleteTrainer, updateTrainer, validateTrainer } from "../actions";
import { CompetencesSection } from "./_competences-section";
import { DocumentsSection } from "./_documents-section";
import { FormationsSection } from "./_formations-section";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SectionsControls } from "@/components/sections-controls";
import { cn } from "@/lib/utils";
import {
  TRAINER_VALIDATION_BADGE_CLASSES,
  TRAINER_VALIDATION_STATUS_LABELS,
  type SkillDomain,
  type SkillLevel,
  type Trainer,
  type TrainerCompetenceWithLabels,
} from "@/lib/trainers/types";

export default async function TrainerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    validated?: string;
    linked?: string;
    unlinked?: string;
    docUploaded?: string;
    docRemoved?: string;
    competenceAdded?: string;
    competenceUpdated?: string;
    competenceRemoved?: string;
    error?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const role = (membership?.role as string | undefined) ?? "";
  const canDelete = role === "admin";

  const [
    { data: trainer, error },
    { data: allFormations },
    { data: linkedFormations },
    { data: skillDomains },
    { data: skillLevels },
    { data: competences },
    { data: audiences },
    { data: modalities },
  ] = await Promise.all([
    supabase
      .from("trainers")
      .select("*")
      .eq("id", id)
      .maybeSingle<Trainer>(),
    supabase
      .from("formations")
      .select("id, title")
      .eq("status", "published")
      .order("title", { ascending: true })
      .limit(200),
    supabase
      .from("trainer_formations")
      .select("formation_id, justification, formation:formations(id, title)")
      .eq("trainer_id", id),
    supabase
      .from("skill_domains")
      .select("*")
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("skill_levels")
      .select("*")
      .eq("is_active", true)
      .order("rank", { ascending: true }),
    supabase
      .from("trainer_competences")
      .select(
        "*, domain:skill_domains(id, name), level:skill_levels(id, name, rank, color)",
      )
      .eq("trainer_id", id),
    supabase
      .from("audience_catalog")
      .select("*")
      .eq("is_active", true)
      .order("position", { ascending: true }),
    supabase
      .from("modality_catalog")
      .select("*")
      .eq("is_active", true)
      .order("position", { ascending: true }),
  ]);

  if (error) throw error;
  if (!trainer) notFound();

  const update = updateTrainer.bind(null, id);
  const remove = deleteTrainer.bind(null, id);
  const validate = validateTrainer.bind(null, id);

  // Token + URL du portail formateur (idempotent : créé à la 1re visite,
  // puis stable). Permet à l'admin de partager le lien d'accès.
  const portal = await getOrCreateTrainerPortalToken(supabase, id);
  const portalOrigin = process.env.NEXT_PUBLIC_APP_URL ?? (() => {
    return "";
  })();
  let trainerPortalUrl: string;
  if (portalOrigin) {
    trainerPortalUrl = buildTrainerPortalUrl(portalOrigin, portal.token);
  } else {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host =
      h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    trainerPortalUrl = buildTrainerPortalUrl(
      `${proto}://${host}`,
      portal.token,
    );
  }

  const notifs = [
    query.created && "Formateur créé avec succès.",
    query.updated && "Modifications enregistrées.",
    query.validated && "Formateur validé.",
    query.linked && "Formation liée au formateur.",
    query.unlinked && "Formation retirée du formateur.",
    query.docUploaded && "Document téléversé.",
    query.docRemoved && "Document supprimé.",
    query.competenceAdded && "Compétence ajoutée.",
    query.competenceUpdated && "Niveau mis à jour.",
    query.competenceRemoved && "Compétence retirée.",
  ].filter(Boolean) as string[];

  const fullName = `${trainer.last_name.toUpperCase()} ${trainer.first_name}`;

  return (
    <>
      <PageHeader
        title={fullName}
        description={
          <div className="space-y-1.5">
            {/* Ligne 1 : société + contact + rayon */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              {trainer.company_name && (
                <span className="font-semibold text-slate-700">
                  {trainer.company_name}
                </span>
              )}
              {trainer.email && (
                <a
                  href={`mailto:${trainer.email}`}
                  className="inline-flex items-center gap-1 text-cyan-700 hover:underline"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {trainer.email}
                </a>
              )}
              {trainer.mobile && (
                <a
                  href={`tel:${trainer.mobile}`}
                  className="inline-flex items-center gap-1 text-slate-700 hover:text-cyan-700"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {trainer.mobile}
                </a>
              )}
              {!trainer.mobile && trainer.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {trainer.phone}
                </span>
              )}
              {trainer.intervention_radius_km &&
              trainer.intervention_radius_km > 0 ? (
                <span className="inline-flex items-center gap-1 text-slate-700">
                  <MapPin className="h-3.5 w-3.5 text-cyan-600" />
                  <span className="font-semibold">
                    {trainer.intervention_radius_km} km
                  </span>
                  {trainer.city && (
                    <span className="text-slate-400">
                      autour de {trainer.city}
                    </span>
                  )}
                </span>
              ) : null}
            </div>

            {/* Ligne 2 : pastilles compétences (compactes) */}
            {(competences ?? []).length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0 mr-0.5" />
                {(
                  competences as unknown as TrainerCompetenceWithLabels[]
                ).map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                    style={{
                      color: c.level?.color ?? "#0e7490",
                      borderColor: c.level?.color ?? "#a5f3fc",
                      backgroundColor: `${c.level?.color ?? "#06b6d4"}10`,
                    }}
                  >
                    {c.domain?.name ?? "—"}
                    <span className="text-[10px] opacity-70">
                      · {c.level?.name ?? "—"}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Formateurs", href: "/formateurs" },
          { label: fullName },
        ]}
        actions={
          <>
            <BackButton fallbackHref="/formateurs" />
            <Button
              variant="default"
              size="sm"
              nativeButton={false}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
              render={
                <Link href={trainerPortalUrl} target="_blank" rel="noopener noreferrer" />
              }
              title="Ouvrir le portail de ce formateur dans un nouvel onglet (URL à partager avec lui)"
            >
              <ExternalLink className="h-4 w-4" />
              Voir le portail
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/formateurs/${id}/fiche`} target="_blank" />}
            >
              <FileDown className="h-4 w-4" />
              Fiche imprimable
            </Button>
            {canDelete && (
              <form action={remove}>
                <Button type="submit" variant="outline" size="sm">
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </Button>
              </form>
            )}
            <Button
              type="submit"
              size="sm"
              form="form-trainer"
              title="Enregistrer les modifications"
            >
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </>
        }
      />

      <div className="p-8 max-w-5xl space-y-6">
        {notifs.map((msg, i) => (
          <div
            key={i}
            className="rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300"
          >
            {msg}
          </div>
        ))}
        {query.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {query.error}
          </div>
        )}

        {/* Bandeau validation */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-5 py-3">
          <div className="text-sm flex items-center gap-3">
            <span className="text-slate-500">Validation :</span>
            <span
              className={cn(
                "inline-block px-2 py-0.5 rounded text-xs font-medium",
                TRAINER_VALIDATION_BADGE_CLASSES[trainer.validation_status],
              )}
            >
              {TRAINER_VALIDATION_STATUS_LABELS[trainer.validation_status]}
            </span>
            {trainer.validated_on && (
              <span className="text-xs text-slate-500">
                le{" "}
                {new Date(trainer.validated_on).toLocaleDateString("fr-FR")}
              </span>
            )}
          </div>
          {trainer.validation_status !== "valide" && (
            <form action={validate}>
              <Button type="submit" variant="outline" size="sm">
                <CheckCircle2 className="h-4 w-4" />
                Valider ce formateur
              </Button>
            </form>
          )}
        </div>

        <SectionsControls
          storageKey={`trainer-sections:${id}`}
          defaultOpenIds={[
            "identification",
            "domaines-d-intervention",
            "adequation-qualiopi",
            "formations-animables",
          ]}
        >
          {/* Barre d'enregistrement HAUT (boutons hors form, associés via form="form-trainer") */}
          <div className="flex items-center justify-end gap-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900 px-4 py-3">
            <span className="text-xs text-cyan-800 dark:text-cyan-300 mr-auto">
              Pensez à enregistrer après modification.
            </span>
            <Button
              variant="outline"
              type="button"
              size="sm"
              nativeButton={false}
              render={<Link href="/formateurs" />}
            >
              Retour
            </Button>
            <Button type="submit" size="sm" form="form-trainer">
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </div>

          <CompetencesSection
            trainerId={id}
            domains={(skillDomains ?? []) as SkillDomain[]}
            levels={(skillLevels ?? []) as SkillLevel[]}
            competences={
              (competences ?? []) as unknown as TrainerCompetenceWithLabels[]
            }
          />

          <FormationsSection
            trainerId={id}
            allFormations={allFormations ?? []}
            linked={
              (linkedFormations ?? []) as unknown as Array<{
                formation_id: string;
                justification: string | null;
                formation: { id: string; title: string } | null;
              }>
            }
          />

          <DocumentsSection
            trainerId={id}
            documents={trainer.documents ?? []}
          />

          <form id="form-trainer" action={update}>
            <TrainerForm
              trainer={trainer}
              audiences={audiences ?? []}
              modalities={modalities ?? []}
            />
          </form>

          {/* Barre d'enregistrement BAS */}
          <div className="mt-2 flex items-center justify-between gap-3">
            {canDelete ? (
              <form action={remove}>
                <Button type="submit" variant="destructive">
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </Button>
              </form>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                type="button"
                nativeButton={false}
                render={<Link href="/formateurs" />}
              >
                Retour
              </Button>
              <Button type="submit" form="form-trainer">
                <Save className="h-4 w-4" />
                Enregistrer
              </Button>
            </div>
          </div>
        </SectionsControls>
      </div>
    </>
  );
}
