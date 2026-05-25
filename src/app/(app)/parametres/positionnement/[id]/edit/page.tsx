import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { PositioningTemplateEditor } from "../../_editor";
import { updatePositioningTemplate } from "../../actions";
import { PositioningFixedSectionsInfo } from "../../_fixed-sections-info";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPositioningTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; duplicated?: string }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const { error, duplicated } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tpl } = await supabase
    .from("positioning_templates")
    .select(
      "id, title, description, is_default, expectation_choices, mastery_criteria",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      title: string;
      description: string | null;
      is_default: boolean;
      expectation_choices: Array<{ key: string; label: string }> | null;
      mastery_criteria: Array<{ key: string; label: string }> | null;
    }>();
  if (!tpl) notFound();

  const update = updatePositioningTemplate.bind(null, id);

  return (
    <>
      <PageHeader
        title={`Modifier : ${tpl.title}`}
        description="Édition du contenu du test. Les clés techniques des items existants sont verrouillées pour ne pas casser les réponses apprenants déjà enregistrées."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres" },
          {
            label: "Tests de positionnement",
            href: "/parametres/positionnement",
          },
          {
            label: tpl.title,
            href: `/parametres/positionnement/${id}`,
          },
          { label: "Modifier" },
        ]}
        actions={
          <BackButton fallbackHref={`/parametres/positionnement/${id}`} />
        }
      />

      <div className="p-8 max-w-3xl space-y-3">
        {duplicated && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
            Template dupliqué. Modifiez le titre et le contenu puis
            enregistrez pour créer votre variante.
          </div>
        )}

        <PositioningFixedSectionsInfo />

        <PositioningTemplateEditor
          mode="edit"
          action={update}
          submitLabel="Enregistrer les modifications"
          initialError={error}
          initiallyDefault={tpl.is_default}
          initial={{
            title: tpl.title,
            description: tpl.description ?? "",
            isDefault: tpl.is_default,
            expectationChoices: tpl.expectation_choices ?? [],
            masteryCriteria: tpl.mastery_criteria ?? [],
          }}
        />
      </div>
    </>
  );
}
