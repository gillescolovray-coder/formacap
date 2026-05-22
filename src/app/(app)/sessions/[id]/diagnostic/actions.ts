"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createMirroredEnrollmentForRequest,
  healEnrollmentsForSession,
} from "@/lib/inscriptions/sync";

/**
 * Réparation des inscriptions orphelines (sans learner_id) pour une
 * session. Pour chaque inscription :
 *   1. Recherche un learner par email (case-insensitive)
 *   2. Sinon, crée un nouveau learner depuis les prospect_* fields
 *   3. Met à jour inscription_request.learner_id
 *   4. Crée / re-lie l'enrollment miroir
 *
 * Utilisé par la page /sessions/[id]/diagnostic (Gilles 2026-05-22) pour
 * réparer manuellement les inscriptions créées avec un bug dans
 * processAdditionalLearners (qui pouvait perdre silencieusement le
 * learner_id). Renvoie le nombre de lignes réparées.
 */
export async function repairOrphanInscriptions(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Org de l'utilisateur
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const organizationId = membership?.organization_id as string | undefined;
  if (!organizationId) {
    redirect(
      `/sessions/${sessionId}/diagnostic?error=${encodeURIComponent("Org introuvable")}`,
    );
  }

  // Inscriptions orphelines (sans learner_id) pour cette session
  const { data: orphans } = await supabase
    .from("inscription_requests")
    .select(
      "id, prospect_first_name, prospect_last_name, prospect_email, prospect_phone, prospect_mobile, prospect_birth_date, company_id, target_session_id",
    )
    .eq("target_session_id", sessionId)
    .is("learner_id", null);

  const orphanRows = (orphans ?? []) as Array<{
    id: string;
    prospect_first_name: string | null;
    prospect_last_name: string | null;
    prospect_email: string | null;
    prospect_phone: string | null;
    prospect_mobile: string | null;
    prospect_birth_date: string | null;
    company_id: string | null;
    target_session_id: string;
  }>;

  let repaired = 0;
  const errors: string[] = [];

  for (const o of orphanRows) {
    // Skip si pas assez d'infos pour créer un learner
    if (!o.prospect_first_name || !o.prospect_last_name) {
      errors.push(
        `Inscription ${o.id.slice(0, 8)} : pas de prénom/nom (impossible de créer un apprenant)`,
      );
      continue;
    }

    // 1) Recherche par email
    let learnerId: string | null = null;
    if (o.prospect_email) {
      const { data: byEmail } = await supabase
        .from("learners")
        .select("id")
        .eq("organization_id", organizationId!)
        .ilike("email", o.prospect_email)
        .limit(1)
        .maybeSingle();
      learnerId = (byEmail?.id as string | null) ?? null;
    }

    // 2) Sinon création
    if (!learnerId) {
      const { data: created, error: createErr } = await supabase
        .from("learners")
        .insert({
          organization_id: organizationId!,
          first_name: o.prospect_first_name,
          last_name: o.prospect_last_name,
          email: o.prospect_email,
          phone: o.prospect_phone,
          mobile: o.prospect_mobile,
          birth_date: o.prospect_birth_date,
          company_id: o.company_id,
          is_active: true,
        })
        .select("id")
        .single();
      if (createErr) {
        errors.push(
          `Inscription ${o.id.slice(0, 8)} : création learner échouée — ${createErr.message}`,
        );
        continue;
      }
      learnerId = (created?.id as string | null) ?? null;
    }

    if (!learnerId) {
      errors.push(`Inscription ${o.id.slice(0, 8)} : learner_id introuvable`);
      continue;
    }

    // 3) Update inscription
    const { error: updErr } = await supabase
      .from("inscription_requests")
      .update({ learner_id: learnerId })
      .eq("id", o.id);
    if (updErr) {
      errors.push(
        `Inscription ${o.id.slice(0, 8)} : update learner_id échoué — ${updErr.message}`,
      );
      continue;
    }

    // 4) Crée enrollment miroir
    await createMirroredEnrollmentForRequest(supabase, {
      id: o.id,
      target_session_id: o.target_session_id,
      learner_id: learnerId,
      stage_key: "confirmed", // si on était au stage confirmed, on garde
    });

    repaired++;
  }

  // Healing global pour rattraper d'éventuels cas qui n'avaient besoin
  // que d'un re-link enrollment.
  await healEnrollmentsForSession(supabase, sessionId);

  revalidatePath(`/sessions/${sessionId}/diagnostic`);
  revalidatePath(`/sessions/${sessionId}/participants`);
  revalidatePath(`/sessions/${sessionId}/conventions`);
  revalidatePath(`/sessions/${sessionId}/convocations`);
  revalidatePath(`/sessions/${sessionId}/emargement`);

  const params = new URLSearchParams({
    repaired: String(repaired),
  });
  if (errors.length > 0) {
    params.set("errors", errors.join(" | "));
  }
  redirect(`/sessions/${sessionId}/diagnostic?${params.toString()}`);
}
