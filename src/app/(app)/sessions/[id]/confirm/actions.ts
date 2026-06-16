"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncSessionCalendar } from "@/lib/google-calendar/sync";
import { sendTrainerConvocation } from "@/lib/sessions/trainer-convocation";

export type ConfirmSessionResult = {
  ok: boolean;
  error?: string;
  /** True si le formateur a bien été notifié par email. */
  trainerEmailSent?: boolean;
  /** True si le formateur n'avait pas d'email (statut quand même passé à confirmed). */
  noTrainerEmail?: boolean;
};

/**
 * Confirme une session :
 *  1. Vérifie qu'un formateur est assigné (session OU au moins un jour)
 *  2. Passe le statut à 'confirmed'
 *  3. Envoie la convocation formateur ET trace le résultat (helper partagé
 *     `sendTrainerConvocation`, utilisé aussi par le menu statut rapide du
 *     tableau pour un comportement identique partout — Gilles 2026-06-16).
 *
 * L'envoi email est non-bloquant : la session est confirmée même si l'email
 * ne part pas, mais on remonte la raison au caller (et on la persiste sur la
 * session via le helper).
 */
export async function confirmSession(
  sessionId: string,
): Promise<ConfirmSessionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  const { data: session } = await supabase
    .from("sessions")
    .select("id, status, trainer_id, trainer:trainers!trainer_id(id)")
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      status: string | null;
      trainer_id: string | null;
      trainer: { id: string } | { id: string }[] | null;
    }>();
  if (!session) return { ok: false, error: "Session introuvable." };

  // Un formateur doit être résolvable (sur la session OU sur au moins un jour)
  // avant de confirmer — sinon la convocation n'aurait aucun destinataire.
  let hasTrainer = Boolean(session.trainer_id && session.trainer);
  if (!hasTrainer) {
    const { data: dayTrainer } = await supabase
      .from("session_days")
      .select("trainer_id")
      .eq("session_id", sessionId)
      .not("trainer_id", "is", null)
      .limit(1)
      .maybeSingle<{ trainer_id: string | null }>();
    hasTrainer = Boolean(dayTrainer?.trainer_id);
  }
  if (!hasTrainer) {
    return {
      ok: false,
      error:
        "Aucun formateur n'est assigné à cette session. Veuillez d'abord en désigner un (sur la fiche session ou sur au moins un jour).",
    };
  }

  if (session.status !== "confirmed") {
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ status: "confirmed" })
      .eq("id", sessionId);
    if (updateError) return { ok: false, error: updateError.message };
  }

  await syncSessionCalendar(sessionId);

  const conv = await sendTrainerConvocation(supabase, sessionId);
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");

  if (conv.reason === "no_email") {
    return { ok: true, trainerEmailSent: false, noTrainerEmail: true };
  }
  if (!conv.sent) {
    return {
      ok: true,
      trainerEmailSent: false,
      error: `Statut confirmé, mais convocation non envoyée : ${conv.error ?? "raison inconnue"}`,
    };
  }
  return { ok: true, trainerEmailSent: true };
}

/**
 * Variante "form-friendly" : appelable depuis un <form action={}> sur
 * la page session. Redirige avec un message en query string.
 */
export async function confirmSessionFormAction(sessionId: string) {
  const res = await confirmSession(sessionId);
  const q = new URLSearchParams();
  if (!res.ok) {
    q.set("error", res.error ?? "Erreur lors de la confirmation.");
  } else if (res.noTrainerEmail) {
    q.set(
      "warning",
      "Session confirmée mais le formateur n'a pas d'email renseigné — convocation non envoyée.",
    );
  } else if (!res.trainerEmailSent) {
    q.set("warning", res.error ?? "Session confirmée, email non envoyé.");
  } else {
    q.set("confirmed", "1");
  }
  redirect(`/sessions/${sessionId}?${q.toString()}`);
}
