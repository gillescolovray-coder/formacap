"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findEligibleItems, sendForItems } from "@/lib/google-review/send";

/**
 * Envoie une demande d'avis Google aux apprenants sélectionnés (envoi MANUEL —
 * Gilles 2026-06-23). Éligibilité revérifiée côté serveur via findEligibleItems
 * (éval à chaud « Très satisfait » + email + pas déjà sollicité). Trace chaque
 * envoi (lien tracé pour le suivi des clics).
 */
export async function sendGoogleReviewRequests(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const selected = new Set(
    formData
      .getAll("enrollmentId")
      .map((v) => String(v))
      .filter(Boolean),
  );
  const redirectBase = `/sessions/${sessionId}/evaluation`;

  if (!sessionId || selected.size === 0) {
    redirect(
      `${redirectBase}?gerror=${encodeURIComponent("Aucun apprenant sélectionné.")}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase
    .from("sessions")
    .select("id, organization_id")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (!session) {
    redirect(
      `${redirectBase}?gerror=${encodeURIComponent("Session introuvable.")}`,
    );
  }

  // Éligibles de la session, restreints à la sélection.
  const eligible = await findEligibleItems(supabase, session!.organization_id, {
    sessionId,
  });
  const items = eligible.filter((i) => selected.has(i.enrollmentId));

  const res = await sendForItems(supabase, {
    orgId: session!.organization_id,
    items,
    channel: "manual",
    sentBy: user.id,
  });

  if (res.error === "no_url") {
    redirect(
      `${redirectBase}?gerror=${encodeURIComponent(
        "Aucun lien d'avis Google configuré (Paramètres > Organisation).",
      )}`,
    );
  }

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?gsent=${res.sent}&gskipped=${res.skipped}`);
}

/**
 * Réinitialise (supprime) des demandes d'avis Google déjà envoyées afin de
 * pouvoir les RENVOYER (Gilles 2026-06-23 : les envois de TEST avaient bloqué
 * le renvoi réel). Org-scoped via RLS. Si aucun enrollmentId fourni, on
 * réinitialise toute la session.
 */
export async function resetGoogleReviewRequests(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  const enrollmentIds = formData
    .getAll("enrollmentId")
    .map((v) => String(v))
    .filter(Boolean);
  const redirectBase = `/sessions/${sessionId}/evaluation`;
  if (!sessionId) redirect(redirectBase);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let q = supabase
    .from("google_review_requests")
    .delete()
    .eq("session_id", sessionId);
  if (enrollmentIds.length > 0) q = q.in("enrollment_id", enrollmentIds);
  await q;

  revalidatePath(redirectBase);
  redirect(`${redirectBase}?greset=1`);
}

export async function toggleEvaluationOpen(
  sessionId: string,
  open: boolean,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ evaluation_open: open })
    .eq("id", sessionId);
  if (error) {
    redirect(
      `/sessions/${sessionId}/evaluation?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath(`/sessions/${sessionId}/evaluation`);
  redirect(
    `/sessions/${sessionId}/evaluation?${open ? "opened=1" : "closed=1"}`,
  );
}
