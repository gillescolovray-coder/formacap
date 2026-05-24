"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createExpressLearnerForSession,
  ensureQuickSignupToken,
} from "@/lib/portal/express-signup";

async function getAdminCtx(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const { data: session } = await supabase
    .from("sessions")
    .select("id, organization_id, end_date, is_subcontracted")
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      end_date: string;
      is_subcontracted: boolean | null;
    }>();
  if (!session) throw new Error("Session introuvable");
  return { supabase, session, userId: user.id };
}

/**
 * Saisie express d'un apprenant temporaire (sous-traitance).
 * Crée le learner is_temporary + l'enrollment + le token portail.
 */
export async function createExpressLearnerAdmin(
  sessionId: string,
  formData: FormData,
) {
  const { supabase, session, userId } = await getAdminCtx(sessionId);

  const result = await createExpressLearnerForSession(supabase, {
    sessionId,
    organizationId: session.organization_id,
    createdBy: userId,
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

  if (!result.ok) {
    redirect(
      `/sessions/${sessionId}?error=${encodeURIComponent(result.error ?? "Erreur saisie express")}`,
    );
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/participants`);
  redirect(
    `/sessions/${sessionId}?expressOk=1`,
  );
}

/**
 * Génère (ou récupère) le token QR d'inscription rapide pour la session.
 * Retourne l'URL publique vers laquelle le QR pointe.
 */
export async function generateQuickSignupTokenAdmin(
  sessionId: string,
): Promise<{ url: string; token: string }> {
  const { supabase, session, userId } = await getAdminCtx(sessionId);

  const token = await ensureQuickSignupToken(supabase, {
    sessionId,
    sessionEndDate: session.end_date,
    createdBy: userId,
  });

  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.capnumerique.com";
  return { url: `${base}/inscription-rapide/${token}`, token };
}
