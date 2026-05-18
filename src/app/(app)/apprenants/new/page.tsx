import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LearnerForm } from "../_form";
import { createLearner } from "../actions";
import { PageHeader } from "@/components/page-header";
import type { Company } from "@/lib/companies/types";

// Force le rechargement de la liste des sociétés à chaque accès, pour qu'une
// société tout juste créée soit immédiatement visible dans le picker.
export const dynamic = "force-dynamic";

export default async function NewLearnerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; company_id?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .order("name", { ascending: true });

  const params = await searchParams;
  // Pré-remplissage de l'entreprise quand la création est lancée depuis la
  // fiche entreprise (`/apprenants/new?company_id=...`). On vérifie que
  // l'ID correspond bien à une entreprise visible avant de l'utiliser.
  const presetCompanyId =
    params.company_id &&
    (companies ?? []).some((c) => c.id === params.company_id)
      ? params.company_id
      : null;
  const presetCompany = presetCompanyId
    ? (companies ?? []).find((c) => c.id === presetCompanyId)
    : null;

  return (
    <>
      <PageHeader
        title="Nouvel apprenant"
        description={
          presetCompany
            ? `Création d'un apprenant rattaché à ${presetCompany.name}.`
            : "Créer la fiche d'une personne à former."
        }
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Apprenants", href: "/apprenants" },
          { label: "Nouveau" },
        ]}
      />
      <div className="p-8 max-w-4xl">
        {params.error && (
          <div className="mb-6 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {params.error}
          </div>
        )}
        <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8">
          <LearnerForm
            companies={(companies ?? []) as Company[]}
            action={createLearner}
            submitLabel="Créer l'apprenant"
            defaultCompanyId={presetCompanyId}
            returnToCompanyId={presetCompanyId}
          />
        </div>
      </div>
    </>
  );
}
