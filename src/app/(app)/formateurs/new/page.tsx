import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrainerForm } from "../_form";
import { createTrainer } from "../actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default async function NewTrainerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: audiences }, { data: modalities }] = await Promise.all([
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

  const params = await searchParams;

  return (
    <>
      <PageHeader
        title="Nouveau formateur"
        description="Référencez un formateur interne ou externe."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Formateurs", href: "/formateurs" },
          { label: "Nouveau" },
        ]}
      />

      <div className="p-8 max-w-5xl">
        {params.error && (
          <div className="mb-6 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
            {params.error}
          </div>
        )}

        <form action={createTrainer}>
          <TrainerForm
            audiences={audiences ?? []}
            modalities={modalities ?? []}
          />

          <div className="mt-8 flex items-center justify-end gap-3">
            <Button
              variant="outline"
              type="button"
              nativeButton={false}
              render={<Link href="/formateurs" />}
            >
              Annuler
            </Button>
            <Button type="submit">Créer le formateur</Button>
          </div>
        </form>
      </div>
    </>
  );
}
