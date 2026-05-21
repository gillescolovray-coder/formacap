"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";

/**
 * Confirme l'ouverture d'une session :
 *   - Change le statut session de `planned/draft` → `confirmed`
 *   - Envoie un email a TOUS les apprenants inscrits actifs
 *   - Trace dans la timeline de chaque inscription_request
 */
export async function confirmSessionOpening(
  sessionId: string,
): Promise<{ ok: true; emailsSent: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  const admin = createAdminClient();

  // Charge la session + formation + orga
  const { data: session } = await admin
    .from("sessions")
    .select(
      `id, organization_id, start_date, end_date, status, modality, location, video_app,
       formation:formations!inner(title)`,
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "Session introuvable." };

  type SessRow = {
    id: string;
    organization_id: string;
    start_date: string | null;
    end_date: string | null;
    status: string;
    modality: string | null;
    location: string | null;
    video_app: string | null;
    formation:
      | { title: string }
      | Array<{ title: string }>
      | null;
  };
  const sess = session as unknown as SessRow;
  const formation = sess.formation
    ? Array.isArray(sess.formation)
      ? sess.formation[0]
      : sess.formation
    : null;

  // Update du statut
  const { error: updErr } = await admin
    .from("sessions")
    .update({ status: "confirmed" })
    .eq("id", sessionId);
  if (updErr) {
    return { ok: false, error: `Mise à jour impossible : ${updErr.message}` };
  }

  // Récupère les apprenants inscrits actifs (statut ≠ annulé)
  const { data: enrollments } = await admin
    .from("session_enrollments")
    .select(
      `id, inscription_request_id,
       learner:learners(first_name, last_name, email)`,
    )
    .eq("session_id", sessionId)
    .neq("status", "cancelled");

  // Récupère le nom de l'orga (signature email)
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", sess.organization_id)
    .maybeSingle<{ name: string }>();
  const orgName = org?.name ?? "Votre organisme de formation";

  // Email à chaque apprenant
  const formationTitle = formation?.title ?? "Votre formation";
  const dateStr = sess.start_date
    ? new Date(sess.start_date + "T00:00:00").toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "(date à confirmer)";
  const endStr =
    sess.end_date && sess.end_date !== sess.start_date
      ? ` au ${new Date(sess.end_date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
      : "";

  let emailsSent = 0;
  if (isResendConfigured()) {
    type EnrRow = {
      id: string;
      inscription_request_id: string | null;
      learner:
        | { first_name: string; last_name: string; email: string | null }
        | Array<{ first_name: string; last_name: string; email: string | null }>
        | null;
    };
    for (const e of (enrollments ?? []) as unknown as EnrRow[]) {
      const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
      if (!learner?.email) continue;
      const fullName = `${learner.first_name} ${learner.last_name}`.trim();
      try {
        await sendEmail({
          to: learner.email,
          toName: fullName,
          subject: `Session confirmée — ${formationTitle}`,
          html: `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;margin:0 auto;">
  <p>Bonjour ${fullName},</p>
  <p>
    Nous vous confirmons l'ouverture de la session de formation
    <strong>« ${formationTitle} »</strong> à laquelle vous êtes inscrit(e).
  </p>
  <p>
    <strong>Date :</strong> ${dateStr}${endStr}<br/>
    ${sess.modality === "presentiel" && sess.location ? `<strong>Lieu :</strong> ${sess.location}<br/>` : ""}
    ${sess.modality === "distanciel" && sess.video_app ? `<strong>Modalité :</strong> Distanciel — ${sess.video_app}<br/>` : ""}
  </p>
  <p>
    Votre convocation officielle et les autres documents Qualiopi
    (convention, programme détaillé, etc.) vous seront transmis dans les
    prochains jours.
  </p>
  <p style="font-size:12px;color:#6b7280;margin-top:24px;">
    Cordialement,<br/>
    ${orgName}
  </p>
</div>`.trim(),
          text: `Bonjour ${fullName},\n\nLa session "${formationTitle}" est confirmée pour le ${dateStr}${endStr}.\n\nCordialement,\n${orgName}`,
        });
        emailsSent++;
        if (e.inscription_request_id) {
          await admin.from("inscription_events").insert({
            request_id: e.inscription_request_id,
            event_type: "session_confirmed_email",
            payload: { session_id: sessionId, sent_to: learner.email },
            actor_id: user.id,
          });
        }
      } catch {
        // best-effort
      }
    }
  }

  revalidatePath("/inscriptions");
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
  revalidatePath("/dashboard");
  return { ok: true, emailsSent };
}

/**
 * Annule une session :
 *   - Change le statut session à `cancelled`
 *   - Marque tous les enrollments actifs comme `cancelled`
 *   - Cherche la prochaine session de la même formation
 *   - Envoie un email aux apprenants avec proposition de report
 */
export async function cancelSessionWithReport(
  sessionId: string,
  reason?: string,
): Promise<
  | { ok: true; emailsSent: number; nextSessionId: string | null }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non authentifié." };

  const admin = createAdminClient();

  // Charge la session
  const { data: session } = await admin
    .from("sessions")
    .select(
      `id, organization_id, formation_id, start_date,
       formation:formations!inner(title)`,
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "Session introuvable." };

  type SessRow = {
    id: string;
    organization_id: string;
    formation_id: string | null;
    start_date: string | null;
    formation:
      | { title: string }
      | Array<{ title: string }>
      | null;
  };
  const sess = session as unknown as SessRow;
  const formation = sess.formation
    ? Array.isArray(sess.formation)
      ? sess.formation[0]
      : sess.formation
    : null;
  const formationTitle = formation?.title ?? "Votre formation";

  // Update du statut session
  const { error: updErr } = await admin
    .from("sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId);
  if (updErr) {
    return { ok: false, error: `Mise à jour impossible : ${updErr.message}` };
  }

  // Marque tous les enrollments actifs comme annulés
  await admin
    .from("session_enrollments")
    .update({ status: "cancelled" })
    .eq("session_id", sessionId)
    .neq("status", "cancelled");

  // Récupère le nom de l'orga
  const { data: org } = await admin
    .from("organizations")
    .select("name, email")
    .eq("id", sess.organization_id)
    .maybeSingle<{ name: string; email: string | null }>();
  const orgName = org?.name ?? "Votre organisme de formation";
  const orgEmail = org?.email ?? null;

  // Cherche la prochaine session de la même formation, à venir, non annulée
  let nextSession: {
    id: string;
    start_date: string | null;
    end_date: string | null;
  } | null = null;
  if (sess.formation_id) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: candidates } = await admin
      .from("sessions")
      .select("id, start_date, end_date, status")
      .eq("organization_id", sess.organization_id)
      .eq("formation_id", sess.formation_id)
      .neq("id", sessionId)
      .neq("status", "cancelled")
      .gte("start_date", todayIso)
      .order("start_date", { ascending: true })
      .limit(1);
    if (candidates && candidates.length > 0) {
      nextSession = {
        id: candidates[0].id as string,
        start_date: candidates[0].start_date as string | null,
        end_date: candidates[0].end_date as string | null,
      };
    }
  }

  // Récupère les apprenants (qui viennent d'être annulés)
  const { data: enrollments } = await admin
    .from("session_enrollments")
    .select(
      `id, inscription_request_id,
       learner:learners(first_name, last_name, email)`,
    )
    .eq("session_id", sessionId);

  const cancelledDateStr = sess.start_date
    ? new Date(sess.start_date + "T00:00:00").toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "(date inconnue)";
  const nextDateStr = nextSession?.start_date
    ? new Date(nextSession.start_date + "T00:00:00").toLocaleDateString(
        "fr-FR",
        { day: "numeric", month: "long", year: "numeric" },
      )
    : null;

  let emailsSent = 0;
  if (isResendConfigured()) {
    type EnrRow = {
      id: string;
      inscription_request_id: string | null;
      learner:
        | { first_name: string; last_name: string; email: string | null }
        | Array<{ first_name: string; last_name: string; email: string | null }>
        | null;
    };
    for (const e of (enrollments ?? []) as unknown as EnrRow[]) {
      const learner = Array.isArray(e.learner) ? e.learner[0] : e.learner;
      if (!learner?.email) continue;
      const fullName = `${learner.first_name} ${learner.last_name}`.trim();
      const reportBlock = nextDateStr
        ? `<p>Une nouvelle session de <strong>« ${formationTitle} »</strong> est prévue le <strong>${nextDateStr}</strong>.</p>
<p>Si vous souhaitez être <strong>reporté(e) sur cette session</strong>, répondez simplement à cet email en confirmant votre choix.</p>`
        : `<p>Nous vous tiendrons informé(e) dès que les prochaines dates de cette formation seront ouvertes.</p>`;
      const reasonBlock = reason?.trim()
        ? `<p><em>Motif : ${reason.trim()}</em></p>`
        : "";
      try {
        await sendEmail({
          to: learner.email,
          toName: fullName,
          subject: `Session annulée — ${formationTitle}`,
          html: `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px;margin:0 auto;">
  <p>Bonjour ${fullName},</p>
  <p>
    Nous regrettons de vous informer que la session de formation
    <strong>« ${formationTitle} »</strong> prévue le <strong>${cancelledDateStr}</strong>
    est <strong style="color:#b91c1c;">annulée</strong>.
  </p>
  ${reasonBlock}
  ${reportBlock}
  <p style="font-size:12px;color:#6b7280;margin-top:24px;">
    Cordialement,<br/>
    ${orgName}
    ${orgEmail ? `<br/>${orgEmail}` : ""}
  </p>
</div>`.trim(),
          text: `Bonjour ${fullName},\n\nLa session "${formationTitle}" du ${cancelledDateStr} est ANNULÉE.${nextDateStr ? `\n\nUne nouvelle session est prévue le ${nextDateStr}. Répondez à cet email pour confirmer votre report.` : "\n\nNous vous tiendrons informé(e) des prochaines dates."}\n\nCordialement,\n${orgName}`,
        });
        emailsSent++;
        if (e.inscription_request_id) {
          await admin.from("inscription_events").insert({
            request_id: e.inscription_request_id,
            event_type: "session_cancelled_email",
            payload: {
              session_id: sessionId,
              next_session_id: nextSession?.id ?? null,
              sent_to: learner.email,
              reason: reason ?? null,
            },
            actor_id: user.id,
          });
        }
      } catch {
        // best-effort
      }
    }
  }

  revalidatePath("/inscriptions");
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
  revalidatePath("/dashboard");
  return {
    ok: true,
    emailsSent,
    nextSessionId: nextSession?.id ?? null,
  };
}
