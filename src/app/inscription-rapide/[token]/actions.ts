"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createExpressLearnerForSession,
  enrollExistingLearnerForSession,
} from "@/lib/portal/express-signup";

/** Normalise un nom/prénom pour comparaison (accents, casse, espaces). */
function normName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type ExistingLearnerCandidate = {
  id: string;
  fullName: string;
  company: string | null;
  cpVille: string | null;
};

/**
 * Anti-doublon à la saisie express (Gilles 2026-06-26) : cherche un apprenant
 * DÉJÀ connu correspondant FORTEMENT à ce que tape la personne (nom + prénom
 * identiques après normalisation, OU email identique). On n'affiche la
 * proposition que sur correspondance forte -> évite d'exposer des fiches au
 * hasard. Retourne prénom/nom + société + CP/ville pour que l'apprenant se
 * reconnaisse (« est-ce bien vous ? »).
 */
export async function searchExistingLearners(
  token: string,
  firstName: string,
  lastName: string,
  email: string,
): Promise<ExistingLearnerCandidate[]> {
  const fn = normName(firstName);
  const ln = normName(lastName);
  const mail = (email ?? "").trim().toLowerCase();
  // Exige au moins nom + prénom (ou un email) pour lancer la recherche.
  if ((!fn || !ln) && !mail) return [];

  const supabase = createAdminClient();
  const { data: tokenRow } = await supabase
    .from("session_quick_signup_tokens")
    .select("session:sessions(organization_id)")
    .eq("token", token)
    .maybeSingle<{ session: { organization_id: string } | null }>();
  const orgId = tokenRow?.session?.organization_id;
  if (!orgId) return [];

  // Présélection BDD : nom approchant (ilike) OU email exact. On affine
  // ensuite en mémoire sur la correspondance normalisée forte.
  let query = supabase
    .from("learners")
    .select(
      "id, civility, first_name, last_name, email, postal_code, city, company:companies(name), company_name_temp",
    )
    .eq("organization_id", orgId)
    .limit(50);
  if (ln && mail) query = query.or(`last_name.ilike.${lastName.trim()},email.eq.${mail}`);
  else if (ln) query = query.ilike("last_name", lastName.trim());
  else query = query.eq("email", mail);

  const { data } = await query;
  const rows = (data ?? []) as Array<{
    id: string;
    civility: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    postal_code: string | null;
    city: string | null;
    company: { name: string | null } | { name: string | null }[] | null;
    company_name_temp: string | null;
  }>;

  const out: ExistingLearnerCandidate[] = [];
  for (const r of rows) {
    const strongName = fn && ln && normName(r.first_name) === fn && normName(r.last_name) === ln;
    const strongEmail = mail && (r.email ?? "").trim().toLowerCase() === mail;
    if (!strongName && !strongEmail) continue;
    const comp = Array.isArray(r.company) ? r.company[0] : r.company;
    out.push({
      id: r.id,
      fullName:
        [r.civility, r.first_name, r.last_name].filter(Boolean).join(" ") ||
        "Apprenant",
      company: comp?.name ?? r.company_name_temp ?? null,
      cpVille: [r.postal_code, r.city].filter(Boolean).join(" ") || null,
    });
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Chemin « c'est moi » : inscrit l'apprenant EXISTANT à la session puis le
 * redirige vers son quiz, sans créer de doublon.
 */
export async function submitQuickSignupExisting(
  token: string,
  learnerId: string,
): Promise<{ ok: false; error: string } | never> {
  const supabase = createAdminClient();
  const { data: tokenRow } = await supabase
    .from("session_quick_signup_tokens")
    .select("session_id, expires_at, session:sessions(id, organization_id)")
    .eq("token", token)
    .maybeSingle<{
      session_id: string;
      expires_at: string;
      session: { id: string; organization_id: string } | null;
    }>();
  if (!tokenRow || !tokenRow.session) {
    return { ok: false, error: "Lien invalide." };
  }
  if (new Date(tokenRow.expires_at) <= new Date()) {
    return { ok: false, error: "Ce lien d'inscription a expiré." };
  }
  const result = await enrollExistingLearnerForSession(supabase, {
    sessionId: tokenRow.session.id,
    organizationId: tokenRow.session.organization_id,
    learnerId,
    createdBy: null,
  });
  if (!result.ok || !result.portalToken) {
    return { ok: false, error: result.error ?? "Inscription impossible." };
  }
  redirect(`/mon-parcours/${result.portalToken}/quiz`);
}

/**
 * Soumission du formulaire d'inscription rapide (sous-traitance).
 * L'apprenant a scanné le QR code, on l'inscrit avec is_temporary=true
 * puis on le redirige direct sur le quiz pré-formation.
 */
export async function submitQuickSignup(
  token: string,
  formData: FormData,
) {
  const supabase = createAdminClient();

  // 1. Valider le token + récupérer la session
  const { data: tokenRow } = await supabase
    .from("session_quick_signup_tokens")
    .select("session_id, expires_at")
    .eq("token", token)
    .maybeSingle<{ session_id: string; expires_at: string }>();

  if (!tokenRow) {
    redirect(
      `/inscription-rapide/${token}?error=${encodeURIComponent("Lien invalide.")}`,
    );
  }
  if (new Date(tokenRow!.expires_at) <= new Date()) {
    redirect(
      `/inscription-rapide/${token}?error=${encodeURIComponent("Ce lien d'inscription a expiré.")}`,
    );
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("id, organization_id")
    .eq("id", tokenRow!.session_id)
    .maybeSingle<{ id: string; organization_id: string }>();

  if (!session) {
    redirect(
      `/inscription-rapide/${token}?error=${encodeURIComponent("Session introuvable.")}`,
    );
  }

  // 2. Créer l'apprenant temporaire + enrollment + token portail
  const result = await createExpressLearnerForSession(supabase, {
    sessionId: session!.id,
    organizationId: session!.organization_id,
    createdBy: null,
    input: {
      civility: formData.get("civility") as string | null,
      firstName: String(formData.get("first_name") ?? ""),
      lastName: String(formData.get("last_name") ?? ""),
      email: formData.get("email") as string | null,
      jobTitle: formData.get("job_title") as string | null,
      companyNameTemp: String(formData.get("company_name_temp") ?? ""),
      companySiretTemp: formData.get("company_siret_temp") as string | null,
    },
  });

  if (!result.ok || !result.portalToken) {
    redirect(
      `/inscription-rapide/${token}?error=${encodeURIComponent(result.error ?? "Inscription impossible.")}`,
    );
  }

  // 3. Redirection directe sur le quiz pré-formation de l'apprenant
  //    (la page /mon-parcours/[token]/quiz détecte automatiquement
  //    qu'il n'y a aucune tentative => phase pré-formation).
  redirect(`/mon-parcours/${result.portalToken}/quiz`);
}
