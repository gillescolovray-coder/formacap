import { redirect } from "next/navigation";
import { Brain, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { importPositioningTemplateFromDocument } from "./actions";

export const dynamic = "force-dynamic";

export default async function ImportPositioningTemplatePage({
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
        title="Importer un test depuis un PDF/Word"
        description="L'IA (Gemini) analyse votre questionnaire et propose un template pré-rempli. Vous pourrez ensuite l'ajuster dans l'éditeur avant de l'utiliser."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Paramètres", href: "/parametres" },
          {
            label: "Tests de positionnement",
            href: "/parametres/positionnement",
          },
          { label: "Importer" },
        ]}
        actions={<BackButton fallbackHref="/parametres/positionnement" />}
      />

      <div className="p-8 max-w-2xl space-y-4">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl bg-gradient-to-br from-violet-50 to-cyan-50 border-2 border-violet-200 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-violet-100 text-violet-700 p-2 shrink-0">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-violet-900">
                Comment ça marche
              </h2>
              <ol className="text-xs text-zinc-700 list-decimal ml-4 mt-1 space-y-0.5">
                <li>
                  Vous uploadez votre questionnaire (PDF, JPG, PNG, WebP — max
                  10 Mo).
                </li>
                <li>
                  Gemini (IA Google) analyse la structure : sections,
                  questions, types (radio / checkbox / matrice / oui-non /
                  texte…).
                </li>
                <li>
                  Un template est créé pré-rempli avec tout ce qu&apos;a
                  détecté l&apos;IA, et vous arrivez directement dans
                  l&apos;éditeur pour valider/ajuster.
                </li>
                <li>
                  Une fois validé, le template est dans votre bibliothèque
                  et peut être rattaché à une formation ou une session.
                </li>
              </ol>
            </div>
          </div>
          <div className="rounded-md bg-white border border-violet-200 p-2.5 text-[11px] text-violet-900">
            <strong>💡 Astuce :</strong> les sections « Informations
            participant » (haut) et « Validation participant »
            (signature, bas) sont automatiquement gérées par
            l&apos;app — pas besoin qu&apos;elles soient dans votre PDF.
            Si elles y sont, l&apos;IA les ignore.
          </div>
        </div>

        <form
          action={importPositioningTemplateFromDocument}
          className="rounded-xl bg-white border border-zinc-200 p-5 space-y-3"
        >
          <label className="block">
            <span className="text-sm font-semibold text-zinc-800 block mb-1.5">
              Fichier du questionnaire
            </span>
            <input
              type="file"
              name="document"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
              required
              className="block w-full text-sm file:mr-4 file:px-4 file:py-2 file:rounded-md file:border-0 file:bg-violet-600 file:text-white file:font-semibold hover:file:bg-violet-700 file:cursor-pointer"
            />
            <span className="text-[11px] text-zinc-500 mt-1.5 block">
              Formats acceptés : PDF, JPG, PNG, WebP. Taille max : 10 Mo.
            </span>
          </label>

          <Button
            type="submit"
            className="bg-violet-600 hover:bg-violet-700 text-white w-full justify-center"
          >
            <Upload className="h-4 w-4" />
            Extraire et créer le template
          </Button>
          <p className="text-[11px] text-zinc-500 text-center">
            L&apos;analyse peut prendre 20 secondes à 1 minute selon la
            taille du document.
          </p>
        </form>

        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          ⚠ <strong>Vérifiez toujours le résultat</strong> après import.
          L&apos;IA est très bonne mais peut se tromper sur des
          questions complexes ou des PDF de mauvaise qualité.
          L&apos;éditeur ouvre directement sur le template extrait pour
          que vous puissiez corriger en quelques clics.
        </div>
      </div>
    </>
  );
}
