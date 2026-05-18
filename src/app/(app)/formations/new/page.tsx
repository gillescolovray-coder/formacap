import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormationForm } from "../_form";
import { createFormation } from "../actions";
import { PdfImportCard } from "./_import-card";
import { PageHeader } from "@/components/page-header";
import type { FormationCategory } from "@/lib/formations/types";

export default async function NewFormationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: categories } = await supabase
    .from("formation_categories")
    .select("*")
    .order("name", { ascending: true });

  const params = await searchParams;

  return (
    <>
      <PageHeader
        title="Nouvelle formation"
        description="Renseignez les informations de votre fiche formation."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Catalogue", href: "/formations" },
          { label: "Nouvelle formation" },
        ]}
      />
      <div className="p-8 max-w-4xl space-y-4">
        {params.error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {params.error}
          </div>
        )}
        <PdfImportCard />
        <FormationForm
          categories={(categories ?? []) as FormationCategory[]}
          action={createFormation}
          submitLabel="Créer la formation"
        />
      </div>
    </>
  );
}
