import Link from "next/link";
import { Save } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompanyForm } from "../_form";
import { createCompany } from "../actions";
import { PageHeader } from "@/components/page-header";
import { SectionsControls } from "@/components/sections-controls";
import { Button } from "@/components/ui/button";

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;

  return (
    <>
      <PageHeader
        title="Nouvelle entreprise"
        description="Ajouter un prospect, client, prescripteur ou financeur."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Entreprises", href: "/entreprises" },
          { label: "Nouvelle" },
        ]}
      />

      <div className="p-8 max-w-5xl">
        {params.error && (
          <div className="mb-6 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {params.error}
          </div>
        )}

        <SectionsControls
          storageKey="company-new-sections"
          defaultOpenIds={["identification", "relation", "contacts"]}
        >
          {/* Barre d'enregistrement haut */}
          <div className="flex items-center justify-end gap-3 rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-3">
            <span className="text-xs text-cyan-800 mr-auto">
              Tous les blocs marqués <span className="text-red-600">*</span>{" "}
              sont obligatoires.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/entreprises" />}
            >
              Annuler
            </Button>
            <Button type="submit" size="sm" form="form-company">
              <Save className="h-4 w-4" />
              Créer l&apos;entreprise
            </Button>
          </div>

          <form id="form-company" action={createCompany}>
            <CompanyForm withContactsBuilder />
          </form>

          {/* Barre d'enregistrement bas */}
          <div className="mt-2 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              nativeButton={false}
              render={<Link href="/entreprises" />}
            >
              Annuler
            </Button>
            <Button type="submit" form="form-company">
              <Save className="h-4 w-4" />
              Créer l&apos;entreprise
            </Button>
          </div>
        </SectionsControls>
      </div>
    </>
  );
}
