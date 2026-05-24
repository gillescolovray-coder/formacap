"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createExpressLearnerForSession } from "@/lib/portal/express-signup";

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
