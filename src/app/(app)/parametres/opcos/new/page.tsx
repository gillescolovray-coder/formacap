import Link from "next/link";
import { Save } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ParametresNav } from "../../_nav";
import { OpcoForm } from "../_form";
import { createOpco } from "../actions";

export default async function NewOpcoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <PageHeader
        title="Nouvel OPCO"
        description="Ajouter un OPCO au référentiel."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres" },
          { label: "OPCO", href: "/parametres/opcos" },
          { label: "Nouveau" },
        ]}
      />
      <ParametresNav />

      <div className="p-8 max-w-4xl">
        <form action={createOpco}>
          <div className="flex items-center justify-end gap-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <span className="text-xs text-emerald-800 mr-auto">
              Renseignez au moins le nom de l&apos;OPCO et son portail web.
            </span>
            <Button
              variant="outline"
              type="button"
              size="sm"
              nativeButton={false}
              render={<Link href="/parametres/opcos" />}
            >
              Annuler
            </Button>
            <Button type="submit" size="sm">
              <Save className="h-4 w-4" />
              Créer l&apos;OPCO
            </Button>
          </div>

          <OpcoForm />

          <div className="flex items-center justify-end gap-3 mt-4">
            <Button
              variant="outline"
              type="button"
              size="sm"
              nativeButton={false}
              render={<Link href="/parametres/opcos" />}
            >
              Annuler
            </Button>
            <Button type="submit" size="sm">
              <Save className="h-4 w-4" />
              Créer l&apos;OPCO
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
