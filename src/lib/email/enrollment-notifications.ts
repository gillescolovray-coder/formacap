"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import { getReferentEmailsForEnrollment } from "@/lib/inscriptions/referents";

// Types locaux (pas exportés depuis un fichier "use server")
type ApprenantResult = {
  ok: boolean;
  enrollmentId: string;
  error?: string;
};

type RhResult = {
  ok: boolean;
  companyId: string;
  companyName: string;
  rhEmail: string;
  error?: string;
};

// =============================================================
//  1) Email apprenant (individuel)
// =============================================================
async function sendApprenantEmail(
  enrollmentId: string,
): Promise<ApprenantResult> {
  const supabase = await createClient();

  const { data: enrollment } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, email, civility), session:sessions(id, organization_id, start_date, end_date, formation:formations(title))",
    )
    .eq("id", enrollmentId)
    .maybeSingle<{
      id: string;
      learner: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        civility: string | null;
      } | null;
      session: {
        id: string;
        organization_id: string;
        start_date: string;
        end_date: string;
        formation: { title: string } | null;
      } | null;
    }>();

  if (!enrollment) {
    return { ok: false, enrollmentId, error: "Inscription introuvable." };
  }
  if (!enrollment.learner?.email) {
    return {
      ok: false,
      enrollmentId,
      error: "L'apprenant n'a pas d'email.",
    };
  }

  const orgId = enrollment.session?.organization_id ?? null;
  const { data: org } = orgId
    ? await supabase
        .from("organizations")
        .select("name, email")
        .eq("id", orgId)
        .maybeSingle<{ name: string; email: string | null }>()
    : { data: null };
  const orgName = org?.name ?? "Notre organisme";

  const learnerName = [
    enrollment.learner.first_name,
    enrollment.learner.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const formationTitle =
    enrollment.session?.formation?.title ?? "votre formation";

  const startDate = enrollment.session?.start_date
    ? new Date(enrollment.session.start_date).toLocaleDateString("fr-FR")
    : "";
  const endDate = enrollment.session?.end_date
    ? new Date(enrollment.session.end_date).toLocaleDateString("fr-FR")
    : "";
  const dateRange =
    startDate === endDate ? `le ${startDate}` : `du ${startDate} au ${endDate}`;

  const subject = `Confirmation d'inscription — ${formationTitle}`;
  const html = `
    <p>Bonjour ${enrollment.learner.civility ?? ""} ${learnerName},</p>
    <p>Nous avons le plaisir de vous confirmer votre inscription à la
    formation <strong>« ${formationTitle} »</strong>, ${dateRange}.</p>
    <p>Vous recevrez prochainement votre <strong>convocation</strong>
    détaillée (dates, horaires, lieu / lien de connexion, formateur).</p>
    <p>Bien cordialement,<br/><strong>${orgName}</strong></p>
  `;
  const text = `Bonjour ${learnerName},\n\nVotre inscription à la formation « ${formationTitle} » ${dateRange} est confirmée.\n\nCordialement,\n${orgName}`;

  // R6 : référents pédagogiques en CC (sur l'email apprenant uniquement —
  // le RH a son propre récap, on ne le double-CC pas).
  const referentCc = await getReferentEmailsForEnrollment(
    supabase,
    enrollmentId,
  );
  const result = await sendEmail({
    to: enrollment.learner.email,
    toName: learnerName,
    subject,
    html,
    text,
    replyTo: org?.email ?? undefined,
    cc: referentCc,
  });

  await supabase.from("email_log").insert({
    organization_id: orgId,
    enrollment_id: enrollmentId,
    type: "enrollment_apprenant",
    to_email: enrollment.learner.email,
    to_name: learnerName,
    subject,
    status: result.ok ? "sent" : "failed",
    provider: "resend",
    provider_id: result.ok ? result.providerId : null,
    error: result.ok ? null : result.error,
    sent_at: result.ok ? new Date().toISOString() : null,
  });

  if (result.ok) {
    await supabase
      .from("session_enrollments")
      .update({ inscription_email_sent_at: new Date().toISOString() })
      .eq("id", enrollmentId);
  }

  return result.ok
    ? { ok: true, enrollmentId }
    : { ok: false, enrollmentId, error: result.error };
}

// =============================================================
//  2) Email RH récapitulatif (1 par société × session)
// =============================================================
async function sendRhRecapEmail(
  sessionId: string,
  companyId: string,
  newlyNotifiedIds: string[],
): Promise<RhResult> {
  const supabase = await createClient();

  // RH principal de la société
  const { data: contact } = await supabase
    .from("company_contacts")
    .select("first_name, last_name, email")
    .eq("company_id", companyId)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle<{
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>();

  // Nom société
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle<{ name: string }>();
  const companyName = company?.name ?? "votre entreprise";

  if (!contact?.email) {
    return {
      ok: false,
      companyId,
      companyName,
      rhEmail: "",
      error: "Pas de contact RH principal avec email.",
    };
  }
  const rhName = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(" ");

  // TOUS les apprenants de cette société inscrits à cette session
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, email, company_id), session:sessions(organization_id, start_date, end_date, formation:formations(title))",
    )
    .eq("session_id", sessionId);

  type Row = {
    id: string;
    learner: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      company_id: string | null;
    } | null;
    session: {
      organization_id: string;
      start_date: string;
      end_date: string;
      formation: { title: string } | null;
    } | null;
  };
  const rows = ((enrollments ?? []) as unknown as Row[]).filter(
    (r) => r.learner?.company_id === companyId,
  );

  if (rows.length === 0) {
    return {
      ok: false,
      companyId,
      companyName,
      rhEmail: contact.email,
      error: "Aucun apprenant de cette société inscrit à cette session.",
    };
  }

  const sessionInfo = rows[0].session;
  const formationTitle = sessionInfo?.formation?.title ?? "votre formation";
  const orgId = sessionInfo?.organization_id ?? null;
  const startDate = sessionInfo?.start_date
    ? new Date(sessionInfo.start_date).toLocaleDateString("fr-FR")
    : "";
  const endDate = sessionInfo?.end_date
    ? new Date(sessionInfo.end_date).toLocaleDateString("fr-FR")
    : "";
  const dateRange =
    startDate === endDate ? `le ${startDate}` : `du ${startDate} au ${endDate}`;

  const { data: org } = orgId
    ? await supabase
        .from("organizations")
        .select("name, email")
        .eq("id", orgId)
        .maybeSingle<{ name: string; email: string | null }>()
    : { data: null };
  const orgName = org?.name ?? "Notre organisme";

  // Construction du tableau d'apprenants
  const newlySet = new Set(newlyNotifiedIds);
  const allList = rows
    .map((r) => ({
      name:
        [r.learner?.first_name, r.learner?.last_name]
          .filter(Boolean)
          .join(" ") || "Apprenant inconnu",
      email: r.learner?.email ?? "",
      isNew: newlySet.has(r.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const newCount = allList.filter((a) => a.isNew).length;
  const subject =
    newCount === allList.length && newCount === newlyNotifiedIds.length
      ? `Inscription${newCount > 1 ? "s" : ""} enregistrée${newCount > 1 ? "s" : ""} : ${companyName} — ${formationTitle}`
      : `Mise à jour des inscriptions : ${companyName} — ${formationTitle}`;

  const tableRows = allList
    .map((a) => {
      const badge = a.isNew
        ? `<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;margin-left:6px;">NOUVEAU</span>`
        : `<span style="color:#64748b;font-size:11px;margin-left:6px;">(déjà inscrit)</span>`;
      return `<li style="padding:4px 0;"><strong>${a.name}</strong>${badge}${a.email ? `<br/><span style="color:#64748b;font-size:12px;">${a.email}</span>` : ""}</li>`;
    })
    .join("");

  const html = `
    <p>Bonjour ${rhName},</p>
    <p>${newCount > 0 ? `Nous avons le plaisir de vous confirmer l'enregistrement de <strong>${newCount} nouvelle${newCount > 1 ? "s" : ""} inscription${newCount > 1 ? "s" : ""}</strong> à la formation` : "Mise à jour des inscriptions à la formation"}
    <strong>« ${formationTitle} »</strong>, ${dateRange}, pour le compte de
    <strong>${companyName}</strong>.</p>
    <p><strong>Liste complète des apprenants inscrits à ce jour (${allList.length})&nbsp;:</strong></p>
    <ul style="padding-left:18px;">${tableRows}</ul>
    <p>Vous recevrez prochainement la <strong>convention de formation</strong>
    à signer pour valider ces inscriptions.</p>
    <p>Bien cordialement,<br/><strong>${orgName}</strong></p>
  `;
  const text =
    `Bonjour ${rhName},\n\n` +
    (newCount > 0
      ? `${newCount} nouvelle(s) inscription(s) à la formation "${formationTitle}" ${dateRange}.\n\n`
      : `Mise à jour des inscriptions à la formation "${formationTitle}".\n\n`) +
    `Liste complète des apprenants inscrits (${allList.length}) :\n` +
    allList
      .map((a) => `- ${a.name}${a.isNew ? " (NOUVEAU)" : " (déjà inscrit)"}`)
      .join("\n") +
    `\n\nCordialement,\n${orgName}`;

  const result = await sendEmail({
    to: contact.email,
    toName: rhName,
    subject,
    html,
    text,
    replyTo: org?.email ?? undefined,
  });

  await supabase.from("email_log").insert({
    organization_id: orgId,
    enrollment_id: null,
    type: "enrollment_rh_recap",
    to_email: contact.email,
    to_name: rhName,
    subject,
    status: result.ok ? "sent" : "failed",
    provider: "resend",
    provider_id: result.ok ? result.providerId : null,
    error: result.ok ? null : result.error,
    sent_at: result.ok ? new Date().toISOString() : null,
  });

  return result.ok
    ? { ok: true, companyId, companyName, rhEmail: contact.email }
    : {
        ok: false,
        companyId,
        companyName,
        rhEmail: contact.email,
        error: result.error,
      };
}

// =============================================================
//  3) Action publique : envoi en masse (skip déjà notifiés)
// =============================================================
export async function sendBulkEnrollmentNotifications(sessionId: string) {
  if (!isResendConfigured()) {
    return {
      total: 0,
      apprenantSent: 0,
      rhSent: 0,
      failed: 0,
      errors: [{ id: "config", reason: "Resend non configuré." }],
    };
  }

  const supabase = await createClient();
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, inscription_email_sent_at, learner:learners(company_id)",
    )
    .eq("session_id", sessionId);

  type Row = {
    id: string;
    inscription_email_sent_at: string | null;
    learner: { company_id: string | null } | null;
  };
  const rows = (enrollments ?? []) as unknown as Row[];

  const toNotify = rows.filter((r) => !r.inscription_email_sent_at);
  return processSelection(
    sessionId,
    toNotify.map((r) => ({
      enrollmentId: r.id,
      companyId: r.learner?.company_id ?? null,
    })),
    rows.length,
  );
}

// =============================================================
//  4) Action publique : envoi à une sélection (depuis modale)
// =============================================================
export async function sendSelectedEnrollmentNotifications(
  enrollmentIds: string[],
) {
  if (!isResendConfigured()) {
    return {
      total: enrollmentIds.length,
      apprenantSent: 0,
      rhSent: 0,
      failed: 0,
      errors: [{ id: "config", reason: "Resend non configuré." }],
    };
  }
  if (enrollmentIds.length === 0) {
    return {
      total: 0,
      apprenantSent: 0,
      rhSent: 0,
      failed: 0,
      errors: [] as Array<{ id: string; reason: string }>,
    };
  }

  const supabase = await createClient();
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select("id, session_id, learner:learners(company_id)")
    .in("id", enrollmentIds);

  type Row = {
    id: string;
    session_id: string;
    learner: { company_id: string | null } | null;
  };
  const rows = (enrollments ?? []) as unknown as Row[];
  const sessionId = rows[0]?.session_id ?? "";

  return processSelection(
    sessionId,
    rows.map((r) => ({
      enrollmentId: r.id,
      companyId: r.learner?.company_id ?? null,
    })),
    enrollmentIds.length,
  );
}

// =============================================================
//  Coeur : 1) envoyer les emails apprenants, 2) regrouper par
//  société et envoyer 1 email RH récapitulatif par société.
// =============================================================
async function processSelection(
  sessionId: string,
  items: Array<{ enrollmentId: string; companyId: string | null }>,
  total: number,
) {
  let apprenantSent = 0;
  let rhSent = 0;
  let failed = 0;
  const errors: Array<{ id: string; reason: string }> = [];

  // 1) Emails apprenants individuels
  for (const item of items) {
    const res = await sendApprenantEmail(item.enrollmentId);
    if (res.ok) apprenantSent++;
    else {
      failed++;
      errors.push({ id: res.enrollmentId, reason: res.error ?? "Erreur" });
    }
  }

  // 2) Groupement par société (1 email RH récapitulatif par société)
  const byCompany = new Map<string, string[]>();
  for (const item of items) {
    if (!item.companyId) continue;
    const arr = byCompany.get(item.companyId) ?? [];
    arr.push(item.enrollmentId);
    byCompany.set(item.companyId, arr);
  }

  for (const [companyId, newlyNotifiedIds] of byCompany) {
    const res = await sendRhRecapEmail(sessionId, companyId, newlyNotifiedIds);
    if (res.ok) rhSent++;
    else {
      // On compte comme avertissement mais pas comme failed (l'apprenant
      // a été notifié, juste le RH manque).
      errors.push({
        id: `rh-${res.companyId}`,
        reason: `RH ${res.companyName} : ${res.error}`,
      });
    }
  }

  revalidatePath(`/sessions/${sessionId}/conventions`);
  revalidatePath(`/sessions/${sessionId}/participants`);

  return {
    total,
    apprenantSent,
    rhSent,
    failed,
    errors,
  };
}
