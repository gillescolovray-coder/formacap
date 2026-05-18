import Link from "next/link";
import {
  CheckCircle2,
  FileDown,
  FileText,
  Save,
  Trash2,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LocationForm } from "../_form";
import {
  deleteLocation,
  markLocationVerified,
  updateLocation,
} from "../actions";
import { DocumentsSection } from "./_documents-section";
import { BackButton } from "@/components/back-button";
import { PageHeader } from "@/components/page-header";
import { SectionsControls } from "@/components/sections-controls";
import { Button } from "@/components/ui/button";
import type { FormationLocation } from "@/lib/locations/types";

export default async function LocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    verified?: string;
    docUploaded?: string;
    docRemoved?: string;
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
  const showCosts = role === "admin" || role === "manager";
  const canDelete = role === "admin";

  const { data: location, error } = await supabase
    .from("formation_locations")
    .select("*")
    .eq("id", id)
    .maybeSingle<FormationLocation>();

  if (error) throw error;
  if (!location) notFound();

  const update = updateLocation.bind(null, id);
  const remove = deleteLocation.bind(null, id);
  const verify = markLocationVerified.bind(null, id);

  const notifs = [
    query.created && "Lieu créé avec succès.",
    query.updated && "Modifications enregistrées.",
    query.verified && "Date de vérification mise à jour.",
    query.docUploaded && "Document téléversé.",
    query.docRemoved && "Document supprimé.",
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader
        title={location.name}
        description={
          location.city
            ? `${location.address ?? ""} ${location.postal_code ?? ""} ${location.city}`.trim()
            : "Fiche de référencement du lieu de formation."
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Lieux", href: "/lieux" },
          { label: location.name },
        ]}
        actions={
          <>
            <BackButton fallbackHref="/lieux" />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/lieux/${id}/fiche-stagiaire`} target="_blank" />}
            >
              <FileText className="h-4 w-4" />
              Fiche stagiaire
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/lieux/${id}/fiche-interne`} target="_blank" />}
            >
              <FileDown className="h-4 w-4" />
              Fiche interne
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
              form="form-location"
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

        {/* Bandeau "dernière vérification" */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-5 py-3">
          <div className="text-sm">
            <span className="text-slate-500">Dernière vérification :</span>{" "}
            <span className="font-medium">
              {location.last_verified_at
                ? new Date(location.last_verified_at).toLocaleDateString(
                    "fr-FR",
                  )
                : "jamais — à programmer"}
            </span>
          </div>
          <form action={verify}>
            <Button type="submit" variant="outline" size="sm">
              <CheckCircle2 className="h-4 w-4" />
              Marquer comme vérifié aujourd&apos;hui
            </Button>
          </form>
        </div>

        <SectionsControls
          storageKey={`location-sections:${id}`}
          defaultOpenIds={["identification", "documents-joints"]}
        >
          <DocumentsSection
            locationId={id}
            documents={location.documents ?? []}
          />

          <form id="form-location" action={update}>
            <LocationForm location={location} showCosts={showCosts} />
          </form>

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
                render={<Link href="/lieux" />}
              >
                Retour
              </Button>
              <Button type="submit" form="form-location">
                Enregistrer
              </Button>
            </div>
          </div>
        </SectionsControls>
      </div>
    </>
  );
}
