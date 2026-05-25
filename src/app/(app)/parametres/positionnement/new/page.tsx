import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { PositioningFormBuilderEditor } from "../_form-builder-editor";
import { makeEmptyStructure } from "@/lib/positioning/form-structure";
import { createPositioningTemplate } from "../actions";
import { PositioningFixedSectionsInfo } from "../_fixed-sections-info";

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

      <div className="p-8 max-w-3xl space-y-4">
        <PositioningFixedSectionsInfo />
        <PositioningFormBuilderEditor
          mode="new"
          action={createPositioningTemplate}
          submitLabel="Créer le template"
          initialError={error}
          initial={{
            title: "",
            description: "",
            isDefault: false,
            structure: makeEmptyStructure(),
          }}
        />
      </div>
    </>
  );
}
