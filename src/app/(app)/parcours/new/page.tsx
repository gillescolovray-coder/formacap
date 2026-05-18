import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ParcoursForm } from "../_form";
import { createParcours } from "../actions";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default async function NewParcoursPage({
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
        title="Nouveau parcours"
        description="Définissez l'identification et les objectifs. Vous ajouterez les sessions ensuite."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Parcours", href: "/parcours" },
          { label: "Nouveau" },
        ]}
      />
      <div className="p-8 max-w-5xl">
        {params.error && (
          <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {params.error}
          </div>
        )}
        <form action={createParcours}>
          <ParcoursForm />
          <div className="mt-8 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              nativeButton={false}
              render={<Link href="/parcours" />}
            >
              Annuler
            </Button>
            <Button type="submit">Créer le parcours</Button>
          </div>
        </form>
      </div>
    </>
  );
}
