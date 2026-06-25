import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { normalizeCompanyName } from "@/lib/companies/dedup";
import { MergeDuplicates, type DupGroup } from "./_merge-duplicates";

/**
 * Détection + fusion des fiches apprenant en doublon (Gilles 2026-06-25).
 * Regroupe par nom + prénom normalisés (tri des mots → gère l'inversion
 * « Nom Prénom » / « Prénom Nom » et les accents/casse). L'utilisateur choisit
 * la fiche à conserver ; les autres y sont fusionnées (toutes les sessions
 * suivent).
 */
export default async function DuplicatesPage() {
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

  const { data: learnersData } = await supabase
    .from("learners")
    .select(
      "id, civility, first_name, last_name, email, postal_code, city, is_temporary, company_id, company:companies(name)",
    )
    .eq("organization_id", organizationId);

  const learners = (learnersData ?? []) as Array<{
    id: string;
    civility: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    postal_code: string | null;
    city: string | null;
    is_temporary: boolean | null;
    company_id: string | null;
    company: { name: string } | { name: string }[] | null;
  }>;

  // Regroupe par clé = mots du nom complet normalisés et TRIÉS (gère
  // l'inversion prénom/nom + accents/casse). On ne garde que les groupes ≥ 2.
  const groupsMap = new Map<string, typeof learners>();
  for (const l of learners) {
    const tokens = normalizeCompanyName(`${l.first_name ?? ""} ${l.last_name ?? ""}`)
      .split(" ")
      .filter(Boolean)
      .sort();
    if (tokens.length === 0) continue;
    const key = tokens.join(" ");
    const arr = groupsMap.get(key) ?? [];
    arr.push(l);
    groupsMap.set(key, arr);
  }
  const dupKeys = [...groupsMap.entries()].filter(([, arr]) => arr.length >= 2);

  // Nombre de sessions par apprenant (pour aider à choisir la fiche à garder)
  // + sessions partagées (fusion bloquée).
  const candidateIds = dupKeys.flatMap(([, arr]) => arr.map((l) => l.id));
  const sessionsByLearner = new Map<string, Set<string>>();
  if (candidateIds.length > 0) {
    const { data: enr } = await supabase
      .from("session_enrollments")
      .select("learner_id, session_id")
      .in("learner_id", candidateIds);
    for (const e of (enr ?? []) as Array<{
      learner_id: string;
      session_id: string;
    }>) {
      const set = sessionsByLearner.get(e.learner_id) ?? new Set<string>();
      set.add(e.session_id);
      sessionsByLearner.set(e.learner_id, set);
    }
  }

  const groups: DupGroup[] = dupKeys
    .map(([key, arr]) => ({
      key,
      learners: arr.map((l) => {
        const comp = Array.isArray(l.company) ? l.company[0] : l.company;
        return {
          id: l.id,
          name:
            [l.civility, l.first_name, l.last_name].filter(Boolean).join(" ") ||
            "Apprenant",
          company: comp?.name ?? null,
          email: l.email,
          cpVille: [l.postal_code, l.city].filter(Boolean).join(" ") || null,
          isTemporary: Boolean(l.is_temporary),
          sessionsCount: sessionsByLearner.get(l.id)?.size ?? 0,
          sessionIds: [...(sessionsByLearner.get(l.id) ?? [])],
        };
      }),
    }))
    .sort((a, b) => b.learners.length - a.learners.length);

  return (
    <>
      <PageHeader
        title="Doublons d'apprenants"
        description="Fiches susceptibles de désigner la même personne (nom + prénom proches). Fusionnez-les en une seule : toutes les sessions sont conservées."
        breadcrumbs={[
          { label: "Tableau de bord", href: "/dashboard" },
          { label: "Apprenants", href: "/apprenants" },
          { label: "Doublons" },
        ]}
        actions={<BackButton fallbackHref="/apprenants" />}
      />
      <div className="p-8 max-w-4xl">
        {groups.length === 0 ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-6 text-center text-sm text-emerald-800">
            ✅ Aucun doublon détecté (même nom + prénom). Rien à fusionner.
          </div>
        ) : (
          <MergeDuplicates groups={groups} />
        )}
      </div>
    </>
  );
}
