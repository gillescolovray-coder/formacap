import Link from "next/link";
import { Save, Trash2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ParcoursForm } from "../_form";
import { deleteParcours, updateParcours } from "../actions";
import { ParcoursSessionsSection } from "./_sessions-section";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { SectionsControls } from "@/components/sections-controls";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PARCOURS_STATUS_BADGE_CLASSES,
  PARCOURS_STATUS_LABELS,
  type Parcours,
} from "@/lib/parcours/types";
import type { FormationModality } from "@/lib/formations/types";

export default async function ParcoursDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    sessionAdded?: string;
    sessionRemoved?: string;
    reordered?: string;
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
    { data: parcours, error },
    { data: sessions },
    { data: standalone },
  ] = await Promise.all([
    supabase
      .from("parcours")
      .select("*")
      .eq("id", id)
      .maybeSingle<Parcours>(),
    supabase
      .from("sessions")
      .select(
        "id, parcours_position, start_date, end_date, modality, location, trainer_name, formation:formations(id, title, duration_hours, duration_days)",
      )
      .eq("parcours_id", id)
      .order("parcours_position", { ascending: true }),
    supabase
      .from("sessions")
      .select(
        "id, start_date, end_date, formation:formations(title)",
      )
      .is("parcours_id", null)
      .order("start_date", { ascending: false })
      .limit(100),
  ]);

  if (error) throw error;
  if (!parcours) notFound();

  const update = updateParcours.bind(null, id);
  const remove = deleteParcours.bind(null, id);

  const notifs = [
    query.created && "Parcours créé.",
    query.updated && "Modifications enregistrées.",
    query.sessionAdded && "Session ajoutée au parcours.",
    query.sessionRemoved && "Session retirée du parcours.",
    query.reordered && "Ordre des sessions mis à jour.",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        title={parcours.name}
        description={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={cn(
                "inline-block px-2 py-0.5 rounded text-xs font-medium",
                PARCOURS_STATUS_BADGE_CLASSES[parcours.status],
              )}
            >
              {PARCOURS_STATUS_LABELS[parcours.status]}
            </span>
            {parcours.internal_code && (
              <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-xs">
                {parcours.internal_code}
              </span>
            )}
            {parcours.description && (
              <span className="text-slate-500">{parcours.description}</span>
            )}
          </div>
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Parcours", href: "/parcours" },
          { label: parcours.name },
        ]}
        actions={
          <>
            <BackButton fallbackHref="/parcours" />
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
              form="form-parcours"
              title="Enregistrer les modifications"
            >
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </>
        }
      />

      <div className="p-8 max-w-5xl space-y-6">
        {notifs.map((m, i) => (
          <div
            key={i}
            className="rounded-xl bg-cyan-50 border border-cyan-200 p-3 text-sm text-cyan-700"
          >
            {m}
          </div>
        ))}
        {query.error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {query.error}
          </div>
        )}

        <SectionsControls
          storageKey={`parcours-sections:${id}`}
          defaultOpenIds={["identification", "sessions-parcours"]}
        >
          {/* Barre d'enregistrement haut */}
          <div className="flex items-center justify-end gap-3 rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-3">
            <span className="text-xs text-cyan-800 mr-auto">
              Pensez à enregistrer après modification.
            </span>
            <Button
              variant="outline"
              type="button"
              size="sm"
              nativeButton={false}
              render={<Link href="/parcours" />}
            >
              Retour
            </Button>
            <Button type="submit" size="sm" form="form-parcours">
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </div>

          <ParcoursSessionsSection
            parcoursId={id}
            sessions={
              (sessions ?? []) as unknown as Array<{
                id: string;
                parcours_position: number | null;
                start_date: string;
                end_date: string;
                modality: FormationModality | null;
                location: string | null;
                trainer_name: string | null;
                formation: {
                  id: string;
                  title: string;
                  duration_hours: number | null;
                  duration_days: number | null;
                } | null;
              }>
            }
            standaloneSessions={
              (standalone ?? []) as unknown as Array<{
                id: string;
                start_date: string;
                end_date: string;
                formation: { title: string } | null;
              }>
            }
          />

          <form id="form-parcours" action={update}>
            <ParcoursForm parcours={parcours} />
          </form>

          {/* Barre d'enregistrement bas */}
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
                render={<Link href="/parcours" />}
              >
                Retour
              </Button>
              <Button type="submit" form="form-parcours">
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
