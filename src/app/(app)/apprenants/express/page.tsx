import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { normalizeCompanyName } from "@/lib/companies/dedup";
import { rankCompanyMatches } from "@/lib/companies/match";
import { ExpressBatch, type ExpressGroup } from "./_express-batch";

/**
 * Traitement en lot des apprenants « Express » (Gilles 2026-06-25) :
 * regroupe par nom d'entreprise saisi en texte libre, propose la meilleure
 * correspondance de la base + SIRENE, et permet de rattacher tous les
 * apprenants d'une même société en un clic. Les cas évidents (nom identique)
 * se traitent automatiquement ; le reste à la main.
 */
export default async function ExpressBatchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const organizationId = membership?.organization_id as string | undefined;
  if (!organizationId) redirect("/apprenants");

  const [{ data: learnersData }, { data: companiesData }] = await Promise.all([
    supabase
      .from("learners")
      .select(
        "id, first_name, last_name, company_name_temp, company_siret_temp",
      )
      .eq("organization_id", organizationId)
      .eq("is_temporary", true)
      .is("company_id", null)
      .order("company_name_temp", { ascending: true }),
    supabase
      .from("companies")
      .select("id, name, siret, postal_code, city")
      .eq("organization_id", organizationId),
  ]);

  const learners = (learnersData ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    company_name_temp: string | null;
    company_siret_temp: string | null;
  }>;
  const companies = (companiesData ?? []) as Array<{
    id: string;
    name: string;
    siret: string | null;
    postal_code: string | null;
    city: string | null;
  }>;

  // Regroupement par nom d'entreprise normalisé.
  const groupsMap = new Map<string, ExpressGroup>();
  for (const l of learners) {
    const key = normalizeCompanyName(l.company_name_temp);
    const groupKey = key || "__none__";
    const fullName =
      [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || "Apprenant";
    let g = groupsMap.get(groupKey);
    if (!g) {
      g = {
        key: groupKey,
        displayName: (l.company_name_temp ?? "").trim() || "(entreprise non renseignée)",
        hasName: Boolean(key),
        siretTemp: l.company_siret_temp,
        learners: [],
        matches: key
          ? rankCompanyMatches(l.company_name_temp, companies, {
              min: 0.34,
              limit: 3,
            }).map((m) => ({
              id: m.company.id,
              name: m.company.name,
              siret: m.company.siret,
              postal_code: m.company.postal_code,
              city: m.company.city,
              score: m.score,
              exact: m.exact,
            }))
          : [],
      };
      groupsMap.set(groupKey, g);
    }
    g.learners.push({ id: l.id, name: fullName });
  }

  // Tri : d'abord les groupes avec correspondance exacte, puis proches, puis sans.
  const groups = [...groupsMap.values()].sort((a, b) => {
    const sa = a.matches[0]?.exact ? 2 : a.matches.length > 0 ? 1 : 0;
    const sb = b.matches[0]?.exact ? 2 : b.matches.length > 0 ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return a.displayName.localeCompare(b.displayName, "fr");
  });

  const totalLearners = learners.length;
  const exactCount = groups
    .filter((g) => g.matches[0]?.exact)
    .reduce((n, g) => n + g.learners.length, 0);

  return (
    <>
      <PageHeader
        title="Apprenants Express — rattacher les entreprises"
        description="Regroupés par entreprise saisie. Rattachez chaque société à une fiche existante (avec SIRET) ou créez-la via SIRENE."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Apprenants", href: "/apprenants" },
          { label: "Express à rattacher" },
        ]}
        actions={<BackButton fallbackHref="/apprenants" />}
      />
      <div className="p-8 max-w-4xl">
        {totalLearners === 0 ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-6 text-center text-sm text-emerald-800">
            ✅ Aucun apprenant Express en attente de rattachement. Tout est à
            jour.
          </div>
        ) : (
          <ExpressBatch
            groups={groups}
            totalLearners={totalLearners}
            exactCount={exactCount}
          />
        )}
      </div>
    </>
  );
}
