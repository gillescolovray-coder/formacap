import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { PositioningTemplateEditor } from "../_editor";
import { createPositioningTemplate } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewPositioningTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <PageHeader
        title="Nouveau test de positionnement"
        description="Composez vos propres attentes et compétences à auto-évaluer. Le test sera ajouté à la bibliothèque et pourra être rattaché à une formation ou à une session."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres" },
          {
            label: "Tests de positionnement",
            href: "/parametres/positionnement",
          },
          { label: "Nouveau" },
        ]}
        actions={<BackButton fallbackHref="/parametres/positionnement" />}
      />

      <div className="p-8 max-w-3xl">
        <PositioningTemplateEditor
          mode="new"
          action={createPositioningTemplate}
          submitLabel="Créer le template"
          initialError={error}
          initial={{
            title: "",
            description: "",
            isDefault: false,
            // Pré-remplissage utile pour démarrer (l'utilisateur peut
            // tout effacer s'il veut partir de zéro).
            expectationChoices: [
              { key: "discover", label: "Découvrir le sujet" },
              { key: "consolidate", label: "Consolider mes bases" },
              { key: "autonomy", label: "Gagner en autonomie" },
            ],
            masteryCriteria: [
              { key: "basics", label: "Comprendre les notions de base" },
              {
                key: "best_practices",
                label: "Appliquer les bonnes pratiques",
              },
            ],
          }}
        />
      </div>
    </>
  );
}
