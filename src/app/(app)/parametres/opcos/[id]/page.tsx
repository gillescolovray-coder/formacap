import Link from "next/link";
import { Save, Trash2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ParametresNav } from "../../_nav";
import { OpcoForm } from "../_form";
import { deleteOpco, updateOpco } from "../actions";
import type { Opco } from "@/lib/opcos/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditOpcoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const query = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: opco } = await supabase
    .from("opcos")
    .select("*")
    .eq("id", id)
    .maybeSingle<Opco>();
  if (!opco) notFound();

  const update = updateOpco.bind(null, opco.id);
  const remove = deleteOpco.bind(null, opco.id);

  return (
    <>
      <PageHeader
        title={opco.name}
        description="Modifier les informations de l'OPCO."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres" },
          { label: "OPCO", href: "/parametres/opcos" },
          { label: opco.name },
        ]}
      />
      <ParametresNav />

      <div className="p-8 max-w-4xl space-y-4">
        {query.error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {query.error}
          </div>
        )}

        <form action={update} id="opco-edit-form">
          <div className="flex items-center justify-end gap-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <span className="text-xs text-emerald-800 mr-auto">
              Pensez à enregistrer après modification.
            </span>
            <Button
              variant="outline"
              type="button"
              size="sm"
              nativeButton={false}
              render={<Link href="/parametres/opcos" />}
            >
              Retour
            </Button>
            <Button type="submit" size="sm">
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </div>

          <OpcoForm opco={opco} />
        </form>

        {/* Boutons de bas — séparés du form principal pour pouvoir
            avoir le bouton « Supprimer » dans son propre form. */}
        <div className="flex items-center justify-between gap-3 mt-4">
          <form action={remove}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="text-rose-700 border-rose-300 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer cet OPCO
            </Button>
          </form>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              type="button"
              size="sm"
              nativeButton={false}
              render={<Link href="/parametres/opcos" />}
            >
              Annuler
            </Button>
            <Button type="submit" size="sm" form="opco-edit-form">
              <Save className="h-4 w-4" />
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
