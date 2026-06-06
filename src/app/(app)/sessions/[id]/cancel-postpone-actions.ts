"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import { syncSessionCalendar } from "@/lib/google-calendar/sync";

/**
 * Annulation ou report d'une session : envoie une notification
 * adaptee au bon destinataire selon le canal d'inscription
 * (apprenant direct vs OF/prescripteur) + au formateur, puis met
 * a jour le statut de la session.
 *
 * Decision : "cancel" (annulation definitive) ou "postpone" (report
 * sur une autre session — l'utilisateur doit avoir cree la session
 * cible auparavant).
 *
 * Gilles 2026-05-28 : V1 — pas de mecanisme de reponse en ligne,
 * l'apprenant/prescripteur recoit juste l'info et te repond
 * directement par telephone/email pour decider.
 */
export type CancelPostponeInput = {
  sessionId: string;
  decision: "cancel" | "postpone";
  /** Obligatoire si decision = "postpone". */
  targetSessionId?: string | null;
  /** Message personnalise optionnel. Si vide, on utilise le template
   *  par defaut adapte a la decision. */
  customMessage?: string | null;
};

export type CancelPostponeResult = {
  ok: boolean;
  error?: string;
  notifications?: {
    learnersDirect: number;
    partners: number;
    trainerNotified: boolean;
    /** Cas vecu : OF inscrit l'apprenant via portail partenaire mais
     *  pas d'email renseigne ni sur l'OF ni sur le contact referent.
     *  On notifie alors l'apprenant en fallback et on signale ces
     *  cas pour que l'admin puisse completer la fiche entreprise. */
    fallbackToLearner: number;
    /** Cas tout aussi vecu : aucun email d'aucune source. On retourne
     *  les noms pour que l'admin sache qui contacter manuellement. */
    skipped: Array<{ name: string; reason: string }>;
  };
};

export async function cancelOrPostponeSession(
  input: CancelPostponeInput,
): Promise<CancelPostponeResult> {
  const { sessionId, decision, targetSessionId, customMessage } = input;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  if (decision === "postpone" && !targetSessionId) {
    return {
      ok: false,
      error:
        "Pour un report, vous devez sélectionner la session sur laquelle reporter.",
    };
  }

  // 1. Charger la session source + formation + formateur + organisme
  const { data: session } = await supabase
    .from("sessions")
    .select(
      `id, organization_id, status, start_date, end_date, trainer_id,
       formation:formations(title),
       trainer:trainers!trainer_id(first_name, last_name, email),
       organization:organizations(name, email)`,
    )
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      status: string | null;
      start_date: string;
      end_date: string;
      trainer_id: string | null;
      formation: { title: string } | null;
      trainer: {
        first_name: string;
        last_name: string;
        email: string | null;
      } | null;
      organization: { name: string; email: string | null } | null;
    }>();
  if (!session) return { ok: false, error: "Session introuvable." };

  // 2. Si report : charger la session cible pour mettre sa date dans le mail
  let targetSession: {
    id: string;
    start_date: string;
    end_date: string;
  } | null = null;
  if (decision === "postpone" && targetSessionId) {
    const { data: tgt } = await supabase
      .from("sessions")
      .select("id, start_date, end_date")
      .eq("id", targetSessionId)
      .maybeSingle<{ id: string; start_date: string; end_date: string }>();
    if (!tgt) {
      return {
        ok: false,
        error: "Session cible du report introuvable.",
      };
    }
    targetSession = tgt;
  }

  // 3. Charger toutes les inscriptions de la session avec :
  //    - learner_id (pour l'email apprenant)
  //    - referrer_company_id (pour determiner si passe par prescripteur)
  //    - contact_referent_email (cas prescripteur avec referent)
  const { data: inscriptions } = await supabase
    .from("inscription_requests")
    .select(
      `id, learner_id, referrer_company_id, contact_referent_email,
       contact_referent_first_name, contact_referent_last_name,
       prospect_first_name, prospect_last_name, prospect_email,
       learner:learners(first_name, last_name, email),
       referrer:companies!referrer_company_id(name, email)`,
    )
    .eq("target_session_id", sessionId);

  type IRow = {
    id: string;
    learner_id: string | null;
    referrer_company_id: string | null;
    contact_referent_email: string | null;
    contact_referent_first_name: string | null;
    contact_referent_last_name: string | null;
    prospect_first_name: string | null;
    prospect_last_name: string | null;
    prospect_email: string | null;
    learner:
      | { first_name: string; last_name: string; email: string | null }
      | Array<{ first_name: string; last_name: string; email: string | null }>
      | null;
    referrer:
      | { name: string; email: string | null }
      | Array<{ name: string; email: string | null }>
      | null;
  };
  const rows = ((inscriptions ?? []) as unknown as IRow[]).map((r) => {
    const learner = Array.isArray(r.learner) ? r.learner[0] : r.learner;
    const referrer = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;
    return {
      id: r.id,
      learnerEmail: learner?.email ?? r.prospect_email ?? null,
      learnerName: learner
        ? `${learner.first_name} ${learner.last_name}`
        : [r.prospect_first_name, r.prospect_last_name]
            .filter(Boolean)
            .join(" "),
      referrerCompanyId: r.referrer_company_id,
      referrerName: referrer?.name ?? null,
      referrerEmail: referrer?.email ?? null,
      contactReferentEmail: r.contact_referent_email,
      contactReferentName: [
        r.contact_referent_first_name,
        r.contact_referent_last_name,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  // 4. Composer le message
  const formationTitle = session.formation?.title ?? "Formation";
  const orgName = session.organization?.name ?? "Notre organisme";
  const sourceDate = new Date(session.start_date).toLocaleDateString(
    "fr-FR",
    { day: "numeric", month: "long", year: "numeric" },
  );
  const targetDate = targetSession
    ? new Date(targetSession.start_date).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const userMessage = (customMessage ?? "").trim();
  const defaultMessage =
    decision === "cancel"
      ? `Nous sommes contraints d'annuler la session « ${formationTitle} » prévue le ${sourceDate}, faute d'un nombre suffisant de participants.\n\nNous vous prions de nous excuser pour ce désagrément. N'hésitez pas à consulter notre catalogue pour vous inscrire à une autre session.`
      : `La session « ${formationTitle} » prévue le ${sourceDate} est reportée au ${targetDate} (pour les mêmes contenus et durée).\n\nMerci de nous confirmer si vous acceptez ce report ou si vous préférez annuler votre inscription. Vous pouvez nous répondre directement par retour d'email.`;
  const messageBody = userMessage || defaultMessage;

  // 5. Determiner pour chaque inscription qui notifier
  //    Logique amelioree Gilles 2026-05-28 : si l'inscription passe
  //    par un partenaire (referrer_company_id != null) mais que le
  //    partenaire n'a aucun email connu (ni companies.email ni
  //    contact_referent_email), on tombe en fallback sur l'apprenant
  //    direct au lieu de skipper en silence. Si meme l'apprenant n'a
  //    pas d'email -> on remonte le skipped pour que l'admin sache.
  const partnerEmailsMap = new Map<
    string,
    { name: string | null; learners: string[] }
  >();
  const directLearnerEmails: Array<{ email: string; name: string }> = [];
  let fallbackCount = 0;
  const skippedList: Array<{ name: string; reason: string }> = [];

  for (const r of rows) {
    if (r.referrerCompanyId) {
      const partnerEmail = r.referrerEmail ?? r.contactReferentEmail ?? null;
      if (partnerEmail) {
        const existing = partnerEmailsMap.get(partnerEmail);
        if (existing) {
          existing.learners.push(r.learnerName || "Apprenant");
        } else {
          partnerEmailsMap.set(partnerEmail, {
            name: r.referrerName ?? r.contactReferentName ?? null,
            learners: [r.learnerName || "Apprenant"],
          });
        }
      } else if (r.learnerEmail) {
        // Fallback : pas d'email partenaire -> on notifie l'apprenant
        // pour ne pas laisser de trou dans la communication.
        directLearnerEmails.push({
          email: r.learnerEmail,
          name: r.learnerName || "Apprenant",
        });
        fallbackCount += 1;
        console.warn(
          "[cancelOrPostpone] fallback vers l'apprenant car OF sans email",
          { requestId: r.id, learnerName: r.learnerName },
        );
      } else {
        skippedList.push({
          name: r.learnerName || "Apprenant inconnu",
          reason:
            "OF/prescripteur sans email ET apprenant sans email — à contacter manuellement",
        });
      }
    } else if (r.learnerEmail) {
      // Apprenant direct (pas de partenaire) : notif a l'apprenant
      directLearnerEmails.push({
        email: r.learnerEmail,
        name: r.learnerName || "Apprenant",
      });
    } else {
      skippedList.push({
        name: r.learnerName || "Apprenant inconnu",
        reason: "Apprenant direct sans email — à contacter manuellement",
      });
    }
  }

  // 6. Envoi des emails
  let notifLearners = 0;
  let notifPartners = 0;
  let trainerNotified = false;

  if (isResendConfigured()) {
    const subject =
      decision === "cancel"
        ? `[${orgName}] Annulation de la session "${formationTitle}" du ${sourceDate}`
        : `[${orgName}] Report de la session "${formationTitle}" au ${targetDate}`;

    const htmlMessage = messageBody
      .split("\n")
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("\n");

    // Email apprenants directs
    for (const apprenant of directLearnerEmails) {
      const res = await sendEmail({
        to: apprenant.email,
        toName: apprenant.name,
        subject,
        html: `<p>Bonjour ${escapeHtml(apprenant.name)},</p>${htmlMessage}<p>Cordialement,<br/><strong>${escapeHtml(orgName)}</strong></p>`,
        text: `Bonjour ${apprenant.name},\n\n${messageBody}\n\nCordialement,\n${orgName}`,
        replyTo: session.organization?.email ?? undefined,
      });
      if (res.ok) notifLearners += 1;
    }

    // Email prescripteurs (groupes : 1 email par prescripteur, liste
    // des apprenants concernes a l'interieur).
    for (const [emailKey, info] of partnerEmailsMap.entries()) {
      const learnersList = info.learners
        .map((n) => `<li>${escapeHtml(n)}</li>`)
        .join("");
      const partnerName = info.name ?? "Madame, Monsieur";
      const html = `
        <p>Bonjour ${escapeHtml(partnerName)},</p>
        ${htmlMessage}
        <p>Apprenant${info.learners.length > 1 ? "s" : ""} concerné${info.learners.length > 1 ? "s" : ""} :</p>
        <ul>${learnersList}</ul>
        <p>Merci de nous confirmer votre décision (${decision === "cancel" ? "prise en compte de l'annulation" : "report accepté OU annulation"}) par retour d'email.</p>
        <p>Cordialement,<br/><strong>${escapeHtml(orgName)}</strong></p>
      `;
      const text = `Bonjour ${partnerName},\n\n${messageBody}\n\nApprenant${info.learners.length > 1 ? "s" : ""} concerné${info.learners.length > 1 ? "s" : ""} :\n${info.learners.map((n) => `- ${n}`).join("\n")}\n\nCordialement,\n${orgName}`;
      const res = await sendEmail({
        to: emailKey,
        toName: info.name ?? undefined,
        subject,
        html,
        text,
        replyTo: session.organization?.email ?? undefined,
      });
      if (res.ok) notifPartners += 1;
    }

    // Email formateur
    if (session.trainer?.email) {
      const trainerName = `${session.trainer.first_name} ${session.trainer.last_name}`;
      const trainerSubject =
        decision === "cancel"
          ? `[${orgName}] Annulation de votre intervention "${formationTitle}" du ${sourceDate}`
          : `[${orgName}] Report de votre intervention "${formationTitle}" au ${targetDate}`;
      const trainerHtml = `
        <p>Bonjour ${escapeHtml(trainerName)},</p>
        ${htmlMessage}
        <p>${decision === "cancel" ? "Votre intervention prévue est donc annulée." : `Votre intervention est reportée au ${escapeHtml(targetDate ?? "")}.`}</p>
        <p>Cordialement,<br/><strong>${escapeHtml(orgName)}</strong></p>
      `;
      const trainerText = `Bonjour ${trainerName},\n\n${messageBody}\n\n${decision === "cancel" ? "Votre intervention prévue est donc annulée." : `Votre intervention est reportée au ${targetDate ?? ""}.`}\n\nCordialement,\n${orgName}`;
      const res = await sendEmail({
        to: session.trainer.email,
        toName: trainerName,
        subject: trainerSubject,
        html: trainerHtml,
        text: trainerText,
        replyTo: session.organization?.email ?? undefined,
      });
      if (res.ok) trainerNotified = true;
    }
  }

  // 7. Mettre a jour le statut de la session source
  const newStatus = decision === "cancel" ? "cancelled" : "postponed";
  await supabase
    .from("sessions")
    .update({ status: newStatus })
    .eq("id", sessionId);

  // Synchro Google Agenda : annulée/reportée -> l'événement est retiré de
  // l'agenda. Si un report crée/cible une nouvelle session, on la synchronise.
  await syncSessionCalendar(sessionId);
  if (targetSession?.id) await syncSessionCalendar(targetSession.id);

  // 8. Si annulation : marquer les conventions de cette session comme
  //    cancelled (preserve l'historique mais signale qu'elles sont
  //    sans objet).
  if (decision === "cancel") {
    await supabase
      .from("session_conventions")
      .update({ status: "cancelled" })
      .eq("session_id", sessionId)
      .in("status", ["draft", "sent", "signed"]);
  }

  // 9. Log dans inscription_events pour chaque inscription (audit)
  if (rows.length > 0) {
    const eventType =
      decision === "cancel"
        ? "session_cancelled_email"
        : "session_postponed_email";
    const payload = {
      decision,
      source_session_id: sessionId,
      target_session_id: targetSession?.id ?? null,
      target_session_start_date: targetSession?.start_date ?? null,
      message: messageBody,
      notif_count: {
        learners_direct: notifLearners,
        partners: notifPartners,
        trainer: trainerNotified,
      },
    };
    await supabase.from("inscription_events").insert(
      rows.map((r) => ({
        request_id: r.id,
        event_type: eventType,
        payload,
        actor_id: user.id,
      })),
    );
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");

  return {
    ok: true,
    notifications: {
      learnersDirect: notifLearners,
      partners: notifPartners,
      trainerNotified,
      fallbackToLearner: fallbackCount,
      skipped: skippedList,
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
