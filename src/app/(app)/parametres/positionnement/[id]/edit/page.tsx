import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { PositioningTemplateEditor } from "../../_editor";
import {
  PositioningFormBuilderEditor,
  makeEmptyStructure,
} from "../../_form-builder-editor";
import { updatePositioningTemplate } from "../../actions";
import { PositioningFixedSectionsInfo } from "../../_fixed-sections-info";
import {
  parseFormStructure,
  type FormStructure,
} from "@/lib/positioning/form-structure";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPositioningTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    duplicated?: string;
    imported?: string;
  }>;
}) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const { error, duplicated, imported } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tpl } = await supabase
    .from("positioning_templates")
    .select(
      "id, title, description, is_default, expectation_choices, mastery_criteria, structure",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      title: string;
      description: string | null;
      is_default: boolean;
      expectation_choices: Array<{ key: string; label: string }> | null;
      mastery_criteria: Array<{ key: string; label: string }> | null;
      structure: unknown;
    }>();
  if (!tpl) notFound();

  const update = updatePositioningTemplate.bind(null, id);
  const parsedStructure: FormStructure | null = parseFormStructure(tpl.structure);

  return (
    <>
      <PageHeader
        title={`Modifier : ${tpl.title}`}
        description={
          parsedStructure
            ? "Éditeur form-builder : composez sections + questions pour adapter le test à votre formation."
            : "Édition du contenu du test (mode classique)."
        }
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
        {imported && (
          <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-sm text-violet-900">
            🧠 <strong>Import IA réussi !</strong> Le template a été
            pré-rempli avec ce que Gemini a détecté dans votre document.
            Vérifiez et ajustez (titre, sections, libellés des questions,
            options…) puis enregistrez.
          </div>
        )}

        <PositioningFixedSectionsInfo />

        {/* Si le template a une structure form-builder → nouvel éditeur,
            sinon → ancien éditeur (legacy 2 listes). */}
        {parsedStructure ? (
          <PositioningFormBuilderEditor
            mode="edit"
            action={update}
            submitLabel="Enregistrer les modifications"
            initialError={error}
            initiallyDefault={tpl.is_default}
            initial={{
              title: tpl.title,
              description: tpl.description ?? "",
              isDefault: tpl.is_default,
              structure: parsedStructure,
            }}
          />
        ) : (
          <>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              ℹ Ce template est en <strong>mode classique</strong> (2
              listes : attentes + compétences). Pour le faire passer en
              mode <strong>form-builder</strong> (sections + questions
              libres), créez un nouveau template puis rattachez-le à la
              place — ou contactez le support pour migration.
            </div>
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
          </>
        )}
      </div>
    </>
  );
}
