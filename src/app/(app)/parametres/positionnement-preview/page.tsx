import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Eye } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  FALLBACK_TEMPLATE,
  loadDefaultPositioningTemplate,
  type PositioningTemplate,
} from "@/lib/positioning/templates";
import { parseFormStructure } from "@/lib/positioning/form-structure";
import { PositioningForm } from "@/app/mon-parcours/[token]/positionnement/_form";
import { DynamicPositioningForm } from "@/app/mon-parcours/[token]/positionnement/_dynamic-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aperçu test de positionnement — CAP NUMERIQUE",
  robots: "noindex, nofollow",
};

/**
 * Aperçu du test de positionnement tel qu'un apprenant le voit
 * (Gilles 2026-05-25).
 *
 * Réservé aux utilisateurs connectés (membres de l'organisation).
 * Le formulaire fonctionne en `previewMode` : rien n'est sauvegardé,
 * le submit affiche juste un message de confirmation simulée.
 */
export default async function PositioningPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template: templateIdParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Récupère le nom de l'organisme courant pour rendre l'aperçu
  // réaliste (logo + nom affichés dans l'entête comme côté apprenant)
  const { data: orgMember } = await supabase
    .from("organization_members")
    .select("organization_id, organization:organizations(name, logo_url)")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<{
      organization_id: string;
      organization: { name: string; logo_url: string | null } | null;
    }>();

  const orgName = orgMember?.organization?.name ?? "CAP NUMERIQUE";

  // Charge le template à prévisualiser :
  // - si ?template=<id> en querystring : ce template précis
  // - sinon : le template par défaut de l'organisation
  // - sinon : fallback hardcodé (si table absente)
  let template: PositioningTemplate = FALLBACK_TEMPLATE;
  try {
    if (templateIdParam && orgMember?.organization_id) {
      const { data } = await supabase
        .from("positioning_templates")
        .select(
          "id, title, description, is_default, expectation_choices, mastery_criteria, structure",
        )
        .eq("id", templateIdParam)
        .eq("organization_id", orgMember.organization_id)
        .maybeSingle<{
          id: string;
          title: string;
          description: string | null;
          is_default: boolean | null;
          expectation_choices: Array<{ key: string; label: string }> | null;
          mastery_criteria: Array<{ key: string; label: string }> | null;
          structure: unknown;
        }>();
      if (data) {
        template = {
          id: data.id,
          title: data.title,
          description: data.description,
          is_default: data.is_default === true,
          expectation_choices:
            data.expectation_choices && data.expectation_choices.length > 0
              ? data.expectation_choices
              : FALLBACK_TEMPLATE.expectation_choices,
          mastery_criteria:
            data.mastery_criteria && data.mastery_criteria.length > 0
              ? data.mastery_criteria
              : FALLBACK_TEMPLATE.mastery_criteria,
          structure: parseFormStructure(data.structure),
        };
      }
    } else if (orgMember?.organization_id) {
      template = await loadDefaultPositioningTemplate(
        supabase,
        orgMember.organization_id,
      );
    }
  } catch {
    /* on garde le fallback */
  }

  // Contexte factice — ce sont les valeurs qu'un apprenant verrait
  // en haut de son formulaire (auto-rempli à partir de sa fiche).
  const today = new Date();
  const inTwoWeeks = new Date(today);
  inTwoWeeks.setDate(today.getDate() + 14);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Bandeau APERÇU — affiché uniquement dans ce mode pour que
          l'admin sache où il est et ne confonde pas avec le vrai test. */}
      <div className="sticky top-0 z-50 bg-amber-500 text-white text-xs sm:text-sm py-2 px-4 text-center font-semibold shadow-md flex items-center justify-center gap-2">
        <Eye className="h-4 w-4" />
        Mode APERÇU — le contenu ci-dessous est exactement ce que voit
        l&apos;apprenant. Rien n&apos;est sauvegardé.
        <Link
          href="/parametres"
          className="ml-3 underline hover:no-underline shrink-0"
        >
          Quitter
        </Link>
      </div>

      <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-4">
        <Link
          href="/parametres"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour aux paramètres
        </Link>

        <header className="text-center space-y-2 mb-2">
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
            Test de positionnement
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900">
            Exemple de formation (aperçu)
          </h1>
        </header>

        {/* Indique quel template est prévisualisé */}
        <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-[11px] text-zinc-600">
          Template prévisualisé :{" "}
          <strong className="text-zinc-900">{template.title}</strong>
          {template.is_default && (
            <span className="ml-2 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">
              Par défaut
            </span>
          )}
          {!templateIdParam && (
            <>
              <br />
              <Link
                href="/parametres/positionnement"
                className="text-cyan-700 hover:underline"
              >
                Choisir un autre template
              </Link>
            </>
          )}
        </div>

        {template.structure ? (
          <DynamicPositioningForm
            portalToken="__preview__"
            previewMode
            structure={template.structure}
            context={{
              orgName,
              formationTitle: "Exemple de formation (aperçu)",
              startDate: today.toISOString().slice(0, 10),
              endDate: inTwoWeeks.toISOString().slice(0, 10),
              modality: "presentiel",
              learnerName: "Marie DUPONT",
              civility: "Mme",
              companyName: "SARL Exemple",
              jobTitle: "Responsable projet",
            }}
          />
        ) : (
          <PositioningForm
            portalToken="__preview__"
            previewMode
            expectationChoices={template.expectation_choices}
            masteryCriteria={template.mastery_criteria}
            context={{
              orgName,
              formationTitle: "Exemple de formation (aperçu)",
              startDate: today.toISOString().slice(0, 10),
              endDate: inTwoWeeks.toISOString().slice(0, 10),
              modality: "presentiel",
              learnerName: "Marie DUPONT",
              civility: "Mme",
              companyName: "SARL Exemple",
              jobTitle: "Responsable projet",
            }}
          />
        )}

        <footer className="text-center text-[11px] text-zinc-400 mt-8">
          Aperçu réservé à l&apos;équipe — vu par le formateur ou
          l&apos;admin pour vérifier le contenu du test de positionnement.
        </footer>
      </div>
    </div>
  );
}
