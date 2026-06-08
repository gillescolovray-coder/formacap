import { Archive, CalendarDays, Clock, Copy, FileText, Save, Trash2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormationForm } from "../_form";
import {
  archiveFormation,
  deleteFormation,
  duplicateFormation,
  updateFormation,
} from "../actions";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MODALITY_BADGE_CLASSES,
  MODALITY_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  type Formation,
  type FormationCategory,
} from "@/lib/formations/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FormationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    error?: string;
    pdfUploaded?: string;
    pdfRemoved?: string;
    extracted?: string;
    imported?: string;
    duplicated?: string;
  }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: formation, error } = await supabase
    .from("formations")
    .select("*")
    .eq("id", id)
    .maybeSingle<Formation>();

  if (error) throw error;
  if (!formation) notFound();

  const [{ data: categories }, { count: sessionCount }] = await Promise.all([
    supabase
      .from("formation_categories")
      .select("*")
      .order("name", { ascending: true }),
    supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("formation_id", id),
  ]);

  // Templates de positionnement (migration 0105, best-effort)
  let availablePositioningTemplates: Array<{
    id: string;
    title: string;
    is_default: boolean;
  }> = [];
  try {
    const { data } = await supabase
      .from("positioning_templates")
      .select("id, title, is_default")
      .eq("organization_id", formation.organization_id)
      .neq("status", "archived")
      .order("is_default", { ascending: false })
      .order("title", { ascending: true });
    availablePositioningTemplates = (data ?? []) as Array<{
      id: string;
      title: string;
      is_default: boolean;
    }>;
  } catch {
    /* migration absente */
  }

  const update = updateFormation.bind(null, id);
  const archive = archiveFormation.bind(null, id);
  const remove = deleteFormation.bind(null, id);
  const duplicate = duplicateFormation.bind(null, id);

  const hasSessions = (sessionCount ?? 0) > 0;

  return (
    <>
      <PageHeader
        title={formation.title}
        description={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border whitespace-nowrap",
                STATUS_BADGE_CLASSES[formation.status],
              )}
            >
              {STATUS_LABELS[formation.status]}
            </span>
            {formation.modality && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap",
                  MODALITY_BADGE_CLASSES[formation.modality],
                )}
              >
                {MODALITY_LABELS[formation.modality]}
              </span>
            )}
            {formation.duration_hours !== null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200 whitespace-nowrap">
                <Clock className="h-3 w-3" />
                {formation.duration_hours} h
              </span>
            )}
            {formation.duration_days !== null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200 whitespace-nowrap">
                <CalendarDays className="h-3 w-3" />
                {formation.duration_days} jour
                {formation.duration_days > 1 ? "s" : ""}
              </span>
            )}
          </div>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Catalogue", href: "/formations" },
          { label: formation.title },
        ]}
        actions={
          <>
            <BackButton fallbackHref="/formations" />
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={
                <a
                  href={`/formations/${formation.id}/programme`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
              title="Aperçu du programme à la charte (impression / PDF)"
            >
              <FileText className="h-4 w-4" />
              Programme (PDF)
            </Button>
            <form action={duplicate}>
              <Button type="submit" variant="outline" size="sm">
                <Copy className="h-4 w-4" />
                Dupliquer
              </Button>
            </form>
            {formation.status !== "archived" && (
              <form action={archive}>
                <Button type="submit" variant="outline" size="sm">
                  <Archive className="h-4 w-4" />
                  Archiver
                </Button>
              </form>
            )}
            {hasSessions ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                title={`Suppression bloquée : ${sessionCount} session${
                  (sessionCount ?? 0) > 1 ? "s" : ""
                } rattachée${
                  (sessionCount ?? 0) > 1 ? "s" : ""
                } à cette formation. Utilisez « Archiver » à la place.`}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
            ) : (
              <form action={remove}>
                <Button type="submit" variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </Button>
              </form>
            )}
            <Button
              type="submit"
              size="sm"
              form="form-formation"
              title="Enregistrer les modifications"
            >
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </>
        }
      />

      <div className="p-8 max-w-4xl">
        {query.created && (
          <div className="mb-6 rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Formation créée avec succès.
          </div>
        )}
        {query.duplicated && (
          <div className="mb-6 rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Formation dupliquée. Vous pouvez maintenant ajuster cette copie.
          </div>
        )}
        {query.updated && (
          <div className="mb-6 rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Modifications enregistrées.
          </div>
        )}
        {query.pdfUploaded && (
          <div className="mb-6 rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            PDF du programme joint avec succès.
          </div>
        )}
        {query.pdfRemoved && (
          <div className="mb-6 rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            PDF retiré.
          </div>
        )}
        {query.extracted && (
          <div className="mb-6 rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            Extraction réussie : {query.extracted} champ
            {Number(query.extracted) > 1 ? "s" : ""} détecté
            {Number(query.extracted) > 1 ? "s" : ""} depuis le PDF. Vérifiez
            les valeurs et ajustez-les si nécessaire avant d&apos;enregistrer.
          </div>
        )}
        {query.imported && (
          <div className="mb-6 rounded-xl bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-900 p-4 text-sm text-cyan-700 dark:text-cyan-300">
            ✨ Formation créée automatiquement depuis le PDF. Vérifiez chaque
            champ et ajustez-le si nécessaire avant de publier.
          </div>
        )}
        {query.error && (
          <div className="mb-6 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {query.error}
          </div>
        )}
        {hasSessions && (
          <div className="mb-6 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 p-3 text-xs text-amber-700 dark:text-amber-300">
            ℹ️ {sessionCount} session{(sessionCount ?? 0) > 1 ? "s sont" : " est"}{" "}
            rattachée{(sessionCount ?? 0) > 1 ? "s" : ""} à cette formation. La
            suppression est désactivée pour éviter de casser l&apos;historique.
            Utilisez le bouton « Archiver » si vous ne voulez plus la voir dans
            le catalogue actif.
          </div>
        )}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8">
          <FormationForm
            formation={formation}
            categories={(categories ?? []) as FormationCategory[]}
            availablePositioningTemplates={availablePositioningTemplates}
            action={update}
            submitLabel="Enregistrer"
          />
        </div>
      </div>
    </>
  );
}
