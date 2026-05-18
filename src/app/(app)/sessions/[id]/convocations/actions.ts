"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { renderPdf } from "@/lib/pdf/render";
import {
  conventionPdfTemplatesWithLegalHtml,
  fetchImageAsDataUrl,
} from "@/lib/pdf/templates";
import { overlayBannerOnFirstPage } from "@/lib/pdf/overlay";
import { loadConvocationEmailTemplate } from "@/lib/document-templates/loader";
import { isResendConfigured, sendEmail } from "@/lib/email/resend";
import { getReferentEmailsForEnrollment } from "@/lib/inscriptions/referents";
import { getTrainingProgramAttachment } from "@/lib/sessions/training-program-attachment";

export async function markConvocationSent(
  sessionId: string,
  enrollmentId: string,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("session_enrollments")
    .update({ convocation_sent_at: new Date().toISOString() })
    .eq("id", enrollmentId);
  if (error) {
    console.error("markConvocationSent error:", error, {
      sessionId,
      enrollmentId,
    });
    throw new Error(error.message);
  }
  revalidatePath(`/sessions/${sessionId}/convocations`);
}

export async function unmarkConvocationSent(
  sessionId: string,
  enrollmentId: string,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("session_enrollments")
    .update({ convocation_sent_at: null })
    .eq("id", enrollmentId);
  if (error) {
    console.error("unmarkConvocationSent error:", error, {
      sessionId,
      enrollmentId,
    });
    throw new Error(error.message);
  }
  revalidatePath(`/sessions/${sessionId}/convocations`);
}

// ============================================================
// Envoi automatique via Resend
// ============================================================

type SendResult = {
  enrollmentId: string;
  ok: boolean;
  error?: string;
};

/**
 * Construit l'URL absolue de l'app à partir des en-têtes de la requête.
 * Indispensable pour que Puppeteer puisse charger la page print.
 */
async function getAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

async function getCookiesForwarder() {
  const c = await cookies();
  return c.getAll().map((x) => ({ name: x.name, value: x.value }));
}

/**
 * Envoie la convocation par email à un apprenant — PDF généré et joint
 * automatiquement. Met à jour convocation_sent_at en cas de succès.
 */
export async function sendConvocationEmail(
  sessionId: string,
  enrollmentId: string,
): Promise<SendResult> {
  const supabase = await createClient();

  if (!isResendConfigured()) {
    await logEmail(supabase, {
      organization_id: null,
      enrollment_id: enrollmentId,
      type: "convocation",
      to_email: "—",
      subject: null,
      status: "failed",
      provider: "resend",
      error:
        "RESEND_API_KEY ou RESEND_FROM manquants — configurer Resend dans les variables d'environnement.",
    });
    return {
      enrollmentId,
      ok: false,
      error:
        "L'envoi automatique n'est pas configuré. Voir Paramètres / Modèles documents.",
    };
  }

  // Récupérer l'inscription + apprenant + session pour construire l'email
  const { data: enrollment, error: fetchError } = await supabase
    .from("session_enrollments")
    .select(
      "id, learner:learners(first_name, last_name, email, civility, company_id, company:companies(name)), session:sessions(id, organization_id, formation:formations(title, duration_hours, duration_days), start_date, end_date, modality, location, location_ref:formation_locations!location_id(name, address, postal_code, city))",
    )
    .eq("id", enrollmentId)
    .maybeSingle<{
      id: string;
      learner: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        civility: string | null;
        company_id: string | null;
        company: { name: string } | null;
      } | null;
      session: {
        id: string;
        organization_id: string;
        formation: {
          title: string;
          duration_hours: number | null;
          duration_days: number | null;
        } | null;
        start_date: string;
        end_date: string;
        modality: "presentiel" | "distanciel" | "hybride" | null;
        location: string | null;
        location_ref: {
          name: string | null;
          address: string | null;
          postal_code: string | null;
          city: string | null;
        } | null;
      } | null;
    }>();

  if (fetchError || !enrollment) {
    return { enrollmentId, ok: false, error: "Inscription introuvable." };
  }
  if (!enrollment.learner?.email) {
    return {
      enrollmentId,
      ok: false,
      error: "L'apprenant n'a pas d'adresse email renseignée.",
    };
  }

  const orgId = enrollment.session?.organization_id ?? null;
  const formationTitle = enrollment.session?.formation?.title ?? "votre formation";
  const learnerName = [
    enrollment.learner.first_name,
    enrollment.learner.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  // Récupérer l'organisation COMPLÈTE pour les templates Puppeteer
  // (header/footer/bandeau) — aligné sur la convention (R18).
  const { data: org } = orgId
    ? await supabase
        .from("organizations")
        .select(
          "name, email, logo_url, siret, nda, address, postal_code, city, phone, legal_mentions, commercial_banner_path",
        )
        .eq("id", orgId)
        .maybeSingle<{
          name: string;
          email: string | null;
          logo_url: string | null;
          siret: string | null;
          nda: string | null;
          address: string | null;
          postal_code: string | null;
          city: string | null;
          phone: string | null;
          legal_mentions: string | null;
          commercial_banner_path: string | null;
        }>()
    : { data: null };
  const orgName = org?.name ?? "Notre organisme";

  // Logo en base64 (fetch serveur, fiabilité dans l'iframe footer)
  const logoDataUrl = await fetchImageAsDataUrl(org?.logo_url ?? null);
  const docTitle = `Convocation — ${formationTitle}`;
  const pdfTemplates = org
    ? conventionPdfTemplatesWithLegalHtml(
        {
          name: org.name,
          logoUrl: logoDataUrl ?? org.logo_url,
          siret: org.siret,
          nda: org.nda,
          address: org.address,
          postalCode: org.postal_code,
          city: org.city,
          phone: org.phone,
          email: org.email,
        },
        docTitle,
        org.legal_mentions ?? null,
      )
    : null;

  // Génération du PDF (page print authentifiée → on transmet les cookies)
  const origin = await getAppOrigin();
  const printUrl = `${origin}/sessions/${sessionId}/convocations/${enrollmentId}/print`;
  const cookieList = await getCookiesForwarder();

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderPdf({
      url: printUrl,
      cookies: cookieList,
      headerTemplate: pdfTemplates?.headerTemplate,
      footerTemplate: pdfTemplates?.footerTemplate,
      margin: { top: "18mm", bottom: "25mm", left: "0mm", right: "0mm" },
    });
  } catch (e) {
    const error = `Génération PDF échouée : ${(e as Error).message}`;
    await logEmail(supabase, {
      organization_id: orgId,
      enrollment_id: enrollmentId,
      type: "convocation",
      to_email: enrollment.learner.email,
      to_name: learnerName,
      subject: null,
      status: "failed",
      provider: "resend",
      error,
    });
    return { enrollmentId, ok: false, error };
  }

  // R18 — Overlay bandeau commercial page 1 (post-traitement pdf-lib)
  if (org?.commercial_banner_path) {
    try {
      const { data: bannerBlob } = await supabase.storage
        .from("organization-banners")
        .download(org.commercial_banner_path);
      if (bannerBlob) {
        const bannerBuf = Buffer.from(await bannerBlob.arrayBuffer());
        const bannerType = bannerBlob.type || "image/png";
        pdfBuffer = await overlayBannerOnFirstPage(
          pdfBuffer,
          bannerBuf,
          bannerType,
        );
      }
    } catch (e) {
      console.warn(
        "[sendConvocation] Overlay bandeau page 1 échoué :",
        (e as Error).message,
      );
    }
  }

  // Préparation des variables pour le template email
  const fmtDateFr = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const startISO = enrollment.session?.start_date;
  const endISO = enrollment.session?.end_date;
  let sessionDateStr = "";
  if (startISO && endISO) {
    sessionDateStr =
      startISO === endISO
        ? `Le ${fmtDateFr(startISO)}`
        : `Du ${fmtDateFr(startISO)} au ${fmtDateFr(endISO)}`;
  }
  const durationDays = enrollment.session?.formation?.duration_days;
  const durationHours = enrollment.session?.formation?.duration_hours;
  const durationDaysStr =
    durationDays != null && durationDays > 0
      ? `${durationDays} jour${durationDays > 1 ? "s" : ""}`
      : "";
  const durationHoursStr =
    durationHours != null && durationHours > 0 ? `${durationHours} h` : "";
  let sessionLocationStr = "";
  const sess = enrollment.session;
  if (sess?.modality === "distanciel") {
    sessionLocationStr = "Distanciel";
  } else if (sess?.location_ref) {
    const parts = [
      sess.location_ref.address,
      [sess.location_ref.postal_code, sess.location_ref.city]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(", ");
    sessionLocationStr = parts || sess.location_ref.name || "";
  } else if (sess?.location) {
    sessionLocationStr = sess.location;
  }
  const companyName = enrollment.learner?.company?.name ?? "";

  // Charger le modèle email convocation (Paramètres → Modèles documents)
  const emailTpl = orgId
    ? await loadConvocationEmailTemplate(orgId)
    : null;
  const emailBlocks = emailTpl?.blocks;
  const emailVars: Record<string, string> = {
    learner_civility: enrollment.learner?.civility ?? "",
    learner_name: learnerName,
    formation_title: formationTitle,
    session_date: sessionDateStr,
    session_location: sessionLocationStr,
    duration_days: durationDaysStr,
    duration_hours: durationHoursStr,
    company_name: companyName,
    org_name: orgName,
  };
  const substitute = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => emailVars[k] ?? "");

  const subject = substitute(
    emailBlocks?.subject_template ??
      `Convocation à la formation — {{formation_title}}`,
  );
  const html = `
    ${substitute(emailBlocks?.intro_html ?? "")}
    ${substitute(emailBlocks?.main_html ?? "")}
    ${substitute(emailBlocks?.closing_html ?? "")}
  `;
  const text = `Bonjour ${learnerName},\n\nVeuillez trouver ci-joint votre convocation à la formation "${formationTitle}" (${sessionDateStr}).\n\nCordialement,\n${orgName}`;

  // Nom de fichier propre
  const safeName = learnerName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const fileName = `convocation-${safeName || enrollmentId.slice(0, 8)}.pdf`;

  // R6 : référents pédagogiques en CC
  const referentCc = await getReferentEmailsForEnrollment(
    supabase,
    enrollmentId,
  );

  // PJ programme de formation officiel (Qualiopi) — joint au même titre
  // que pour les conventions (règle R8).
  const programAttachment = await getTrainingProgramAttachment(
    supabase,
    sessionId,
  );

  const result = await sendEmail({
    to: enrollment.learner.email,
    toName: learnerName,
    subject,
    html,
    text,
    replyTo: org?.email ?? undefined,
    cc: referentCc,
    attachments: [
      { filename: fileName, content: pdfBuffer, contentType: "application/pdf" },
      ...(programAttachment ? [programAttachment] : []),
    ],
  });

  if (!result.ok) {
    await logEmail(supabase, {
      organization_id: orgId,
      enrollment_id: enrollmentId,
      type: "convocation",
      to_email: enrollment.learner.email,
      to_name: learnerName,
      subject,
      status: "failed",
      provider: "resend",
      error: result.error,
    });
    return { enrollmentId, ok: false, error: result.error };
  }

  // Succès : log + mise à jour convocation_sent_at
  await logEmail(supabase, {
    organization_id: orgId,
    enrollment_id: enrollmentId,
    type: "convocation",
    to_email: enrollment.learner.email,
    to_name: learnerName,
    subject,
    status: "sent",
    provider: "resend",
    provider_id: result.providerId,
  });

  await supabase
    .from("session_enrollments")
    .update({ convocation_sent_at: new Date().toISOString() })
    .eq("id", enrollmentId);

  revalidatePath(`/sessions/${sessionId}/convocations`);
  return { enrollmentId, ok: true };
}

/**
 * Envoie en masse les convocations à toutes les inscriptions d'une session
 * (uniquement celles avec un email) qui n'ont pas encore été envoyées.
 *
 * Renvoie un récap aggregé : nombre envoyés / échoués / sans email.
 */
export async function sendBulkConvocations(
  sessionId: string,
): Promise<{
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ name: string; reason: string }>;
}> {
  const supabase = await createClient();
  const { data: enrollments } = await supabase
    .from("session_enrollments")
    .select(
      "id, convocation_sent_at, inscription_request_id, learner:learners(first_name, last_name, email)",
    )
    .eq("session_id", sessionId);

  type Row = {
    id: string;
    convocation_sent_at: string | null;
    inscription_request_id: string | null;
    learner: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  };
  const rows = (enrollments ?? []) as unknown as Row[];

  // Identifier les inscriptions venant d'un OF partenaire : CAP NUMÉRIQUE
  // n'envoie PAS de convocation pour ces inscriptions (l'OF s'en charge).
  const requestIds = Array.from(
    new Set(
      rows
        .map((r) => r.inscription_request_id)
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const isViaPartnerOf = new Set<string>();
  if (requestIds.length > 0) {
    const { data: reqs } = await supabase
      .from("inscription_requests")
      .select("id, referrer:companies!referrer_company_id(type)")
      .in("id", requestIds);
    for (const r of (reqs ?? []) as Array<{
      id: string;
      referrer: { type: string } | Array<{ type: string }> | null;
    }>) {
      const ref = Array.isArray(r.referrer) ? r.referrer[0] : r.referrer;
      if (ref?.type === "of") isViaPartnerOf.add(r.id);
    }
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ name: string; reason: string }> = [];

  for (const r of rows) {
    const name =
      [r.learner?.first_name, r.learner?.last_name].filter(Boolean).join(" ") ||
      r.id.slice(0, 8);

    // Skip si déjà envoyée, pas d'email, ou inscription gérée par un OF partenaire
    if (r.convocation_sent_at) {
      skipped++;
      continue;
    }
    if (
      r.inscription_request_id &&
      isViaPartnerOf.has(r.inscription_request_id)
    ) {
      skipped++;
      continue;
    }
    if (!r.learner?.email) {
      skipped++;
      errors.push({ name, reason: "Pas d'email renseigné" });
      continue;
    }

    const res = await sendConvocationEmail(sessionId, r.id);
    if (res.ok) sent++;
    else {
      failed++;
      errors.push({ name, reason: res.error ?? "Erreur inconnue" });
    }
  }

  revalidatePath(`/sessions/${sessionId}/convocations`);
  return { total: rows.length, sent, failed, skipped, errors };
}

// ============================================================
// Helpers internes
// ============================================================

type EmailLogEntry = {
  organization_id: string | null;
  enrollment_id: string | null;
  type: string;
  to_email: string;
  to_name?: string | null;
  subject: string | null;
  status: "queued" | "sent" | "failed";
  provider?: string;
  provider_id?: string;
  error?: string;
};

async function logEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entry: EmailLogEntry,
) {
  const sentAt = entry.status === "sent" ? new Date().toISOString() : null;
  await supabase.from("email_log").insert({
    organization_id: entry.organization_id,
    enrollment_id: entry.enrollment_id,
    type: entry.type,
    to_email: entry.to_email,
    to_name: entry.to_name ?? null,
    subject: entry.subject,
    status: entry.status,
    provider: entry.provider ?? null,
    provider_id: entry.provider_id ?? null,
    error: entry.error ?? null,
    sent_at: sentAt,
  });
}
