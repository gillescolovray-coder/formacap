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
        "id, first_name, last_name, company_id, company_name_temp, company_siret_temp, company:companies(id, name)",
      )
      .eq("organization_id", organizationId)
      .eq("is_temporary", true)
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
    company_id: string | null;
    company_name_temp: string | null;
    company_siret_temp: string | null;
    company: { id: string; name: string } | { id: string; name: string }[] | null;
  }>;
  const companies = (companiesData ?? []) as Array<{
    id: string;
    name: string;
    siret: string | null;
    postal_code: string | null;
    city: string | null;
  }>;

  // Regroupement : si l'apprenant a DÉJÀ une entreprise -> groupe par cette
  // entreprise (action « Valider ») ; sinon par nom saisi en texte libre
  // (action « Rattacher »). Ainsi on montre TOUS les Express (= compteur).
  const groupsMap = new Map<string, ExpressGroup>();
  for (const l of learners) {
    const linked = Array.isArray(l.company) ? l.company[0] : l.company;
    const fullName =
      [l.first_name, l.last_name].filter(Boolean).join(" ").trim() || "Apprenant";

    if (l.company_id && linked) {
      // Déjà rattaché à une fiche entreprise -> il reste juste à « valider ».
      const groupKey = `cid:${l.company_id}`;
      let g = groupsMap.get(groupKey);
      if (!g) {
        g = {
          key: groupKey,
          displayName: linked.name,
          hasName: true,
          alreadyAttached: true,
          companyId: l.company_id,
          siretTemp: null,
          learners: [],
          matches: [],
        };
        groupsMap.set(groupKey, g);
      }
      g.learners.push({ id: l.id, name: fullName });
      continue;
    }

    const key = normalizeCompanyName(l.company_name_temp);
    const groupKey = key ? `name:${key}` : "__none__";
    let g = groupsMap.get(groupKey);
    if (!g) {
      g = {
        key: groupKey,
        displayName:
          (l.company_name_temp ?? "").trim() || "(entreprise non renseignée)",
        hasName: Boolean(key),
        alreadyAttached: false,
        companyId: null,
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

  // Tri : à rattacher d'abord (corresp. exacte > proche > aucune), déjà
  // rattachés (à valider) en dernier.
  function rank(g: ExpressGroup): number {
    if (g.alreadyAttached) return -1;
    if (g.matches[0]?.exact) return 3;
    if (g.matches.length > 0) return 2;
    return 1;
  }
  const groups = [...groupsMap.values()].sort((a, b) => {
    const d = rank(b) - rank(a);
    if (d !== 0) return d;
    return a.displayName.localeCompare(b.displayName, "fr");
  });

  const totalLearners = learners.length;
  const exactCount = groups
    .filter((g) => !g.alreadyAttached && g.matches[0]?.exact)
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
